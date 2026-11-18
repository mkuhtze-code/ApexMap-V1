import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Truck,
  DollarSign,
  Send,
  Loader2,
  X,
  Compass,
  ArrowRight,
  ShieldCheck,
  Package,
  Layers,
  Wand2
} from 'lucide-react';
import {
  RoofOutline,
  SkeletonLine,
  RoofPlane,
  LayoutResult
} from '../../types/exactRoofing';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  planes: RoofPlane[];
  layout: LayoutResult | null;
  onApplyGeneratedRoof: (points: { x: number; y: number }[], pitchDeg: number) => void;
  projectTitle?: string;
}

export const RoofingAiCopilotModal: React.FC<Props> = ({
  isOpen,
  onClose,
  outline,
  skeleton,
  planes,
  layout,
  onApplyGeneratedRoof,
  projectTitle = 'Profiled Metal Roof'
}) => {
  const [activeTab, setActiveTab] = useState<'cad_builder' | 'compliance_audit' | 'rollformer_staging' | 'bom_takeoff'>('cad_builder');

  // CAD Builder State
  const [promptText, setPromptText] = useState<string>('16m by 10m L-shape hip roof with 6m wing at 25 degree pitch');
  const [isBuildingCad, setIsBuildingCad] = useState<boolean>(false);
  const [generatedCadResult, setGeneratedCadResult] = useState<{
    points: { x: number; y: number }[];
    recommendedPitchDeg: number;
    explanation: string;
  } | null>(null);

  // Compliance Audit State
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [auditData, setAuditData] = useState<any>(null);

  // Roll-Former Staging State
  const [isLoadingStaging, setIsLoadingStaging] = useState<boolean>(false);
  const [stagingData, setStagingData] = useState<any>(null);

  // BOM State
  const [isLoadingBom, setIsLoadingBom] = useState<boolean>(false);
  const [bomData, setBomData] = useState<any>(null);

  if (!isOpen) return null;

  // 1. Run CAD Builder
  const handleGenerateCad = async () => {
    if (!promptText.trim()) return;
    setIsBuildingCad(true);
    try {
      const res = await fetch('/api/ai/roof-cad-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      });
      const data = await res.json();
      setGeneratedCadResult(data);
    } catch (err) {
      console.error('Failed to generate CAD from prompt:', err);
    } finally {
      setIsBuildingCad(false);
    }
  };

  // 2. Run Compliance Audit
  const handleRunAudit = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/ai/roof-cop-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planes,
          profile: 'TRS Plumbdeck Trapezoidal 0.55mm',
          windZone: 'Very High',
          exposureZone: 'Zone C (Medium)'
        })
      });
      const data = await res.json();
      setAuditData(data);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // 3. Run Roll-Former Staging
  const handleRunStaging = async () => {
    setIsLoadingStaging(true);
    try {
      const res = await fetch('/api/ai/roof-rollformer-staging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout,
          projectTitle,
          profile: 'TRS Plumbdeck 0.55mm'
        })
      });
      const data = await res.json();
      setStagingData(data);
    } catch (err) {
      console.error('Staging failed:', err);
    } finally {
      setIsLoadingStaging(false);
    }
  };

  // 4. Run BOM Takeoff
  const handleRunBom = async () => {
    setIsLoadingBom(true);
    try {
      const res = await fetch('/api/ai/roof-estimator-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout,
          planes,
          profile: 'TRS Plumbdeck 0.55mm',
          material: 'Kiwicolour® Vitor+ PVDF'
        })
      });
      const data = await res.json();
      setBomData(data);
    } catch (err) {
      console.error('BOM failed:', err);
    } finally {
      setIsLoadingBom(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in">
      <div className="bg-[#0f172a] border border-slate-800 text-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-950/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  ApexMap™ AI Engineering Copilot
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono font-bold border border-blue-500/30">
                  Gemini 3.8 Logic
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Natural-language roof building, NZBC E2/AS1 code audits, and factory roll-former staging.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-800/60 bg-slate-950/40 flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'cad_builder', label: 'Prompt to Roof CAD', icon: Wand2 },
            { id: 'compliance_audit', label: 'NZBC E2 / MRM Audit', icon: ShieldCheck },
            { id: 'rollformer_staging', label: 'Factory & Crane Staging', icon: Truck },
            { id: 'bom_takeoff', label: 'Material BOM & Cost', icon: DollarSign }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (tab.id === 'compliance_audit' && !auditData) handleRunAudit();
                  if (tab.id === 'rollformer_staging' && !stagingData) handleRunStaging();
                  if (tab.id === 'bom_takeoff' && !bomData) handleRunBom();
                }}
                className={`flex items-center gap-2 py-2.5 px-3.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* TAB 1: PROMPT TO ROOF CAD */}
          {activeTab === 'cad_builder' && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-3">
                <label className="text-slate-300 font-bold block text-xs">
                  Describe the roof shape, dimensions, and pitch in plain English:
                </label>
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder="e.g. 15m by 9m hip roof with a 4m x 5m front porch projection at 25 degrees"
                    className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-white text-xs font-medium focus:outline-hidden focus:border-blue-500"
                  />
                  <button
                    onClick={handleGenerateCad}
                    disabled={isBuildingCad}
                    className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg transition-all cursor-pointer flex flex-col items-center justify-center gap-1 shrink-0"
                  >
                    {isBuildingCad ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    <span>{isBuildingCad ? 'Computing...' : 'Generate CAD'}</span>
                  </button>
                </div>

                {/* Quick Prompts */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Quick Samples:</span>
                  {[
                    '16m x 10m L-shape with 6m wing at 25° pitch',
                    '14m x 10m pavilion with central 4m ridge',
                    '12m x 8m classic duo-pitch gable at 15°',
                    '18m x 12m T-shape villa with 30° pitch'
                  ].map((sample) => (
                    <button
                      key={sample}
                      onClick={() => setPromptText(sample)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[10px] font-medium border border-slate-700/60"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generated Result Preview Card */}
              {generatedCadResult && (
                <div className="bg-emerald-950/30 border border-emerald-500/40 p-4 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="font-extrabold text-emerald-300 text-xs">
                        Roof Geometry Generated ({generatedCadResult.points.length} vertices, {generatedCadResult.recommendedPitchDeg}° pitch)
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        onApplyGeneratedRoof(
                          generatedCadResult.points,
                          generatedCadResult.recommendedPitchDeg
                        );
                        onClose();
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Load into Plan Canvas</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-300">
                    {generatedCadResult.explanation}
                  </p>

                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-400 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-500">Polygon Vertices:</div>
                    <div className="flex flex-wrap gap-2">
                      {generatedCadResult.points.map((p, idx) => (
                        <span key={idx} className="bg-slate-900 px-2 py-0.5 rounded text-white border border-slate-800">
                          P{idx + 1}: ({p.x}m, {p.y}m)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CODE OF PRACTICE COMPLIANCE AUDIT */}
          {activeTab === 'compliance_audit' && (
            <div className="space-y-4">
              {isLoadingAudit ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <span>Auditing roof against NZBC E2/AS1 &amp; NZMRM Code of Practice...</span>
                </div>
              ) : auditData ? (
                <div className="space-y-4">
                  {/* Overall Status Banner */}
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold text-white">
                            Status: {auditData.overallStatus}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px]">
                            {auditData.complianceScore}/100 Score
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs">
                          Supervised by {auditData.supervisor} · LBP Signoff: {auditData.lbpSignoffReady ? 'Ready for Council PS3' : 'Review Required'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleRunAudit}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold border border-slate-700"
                    >
                      Re-Audit
                    </button>
                  </div>

                  {/* Checklist Items */}
                  <div className="space-y-2">
                    {auditData.audits?.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl flex items-start gap-3"
                      >
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] shrink-0 ${
                            item.status === 'PASS'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {item.status}
                        </span>
                        <div>
                          <div className="font-bold text-white text-xs">{item.check}</div>
                          <p className="text-slate-400 text-[11px] mt-0.5">{item.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recommendations */}
                  {auditData.keyRecommendations?.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
                      <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Foreman Action Plan:
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs">
                        {auditData.keyRecommendations.map((rec: string, i: number) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 3: ROLL-FORMER FACTORY & CRANE STAGING */}
          {activeTab === 'rollformer_staging' && (
            <div className="space-y-4">
              {isLoadingStaging ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                  <span>Computing factory coil run &amp; HIAB crane lift bundles...</span>
                </div>
              ) : stagingData ? (
                <div className="space-y-4">
                  {/* Order Specs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Total Ordered Blanks</div>
                      <div className="text-lg font-black text-white font-mono mt-0.5">
                        {stagingData.totalOrderedBlanks} pcs
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Total Ordered Run</div>
                      <div className="text-lg font-black text-sky-400 font-mono mt-0.5">
                        {stagingData.totalOrderedMetres} m
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Lineal Metres Saved</div>
                      <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                        +{stagingData.savedMetres} m
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Batch Reference</div>
                      <div className="text-xs font-black text-purple-300 font-mono mt-1">
                        {stagingData.coilBatchNumber}
                      </div>
                    </div>
                  </div>

                  {/* Crane Packs */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-white uppercase tracking-wider">
                      HIAB Crane Staging Bundles:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {stagingData.craneLiftPacks?.map((pack: any, i: number) => (
                        <div
                          key={i}
                          className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-white text-xs flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: pack.colorTag || '#3b82f6' }}
                              />
                              {pack.packId}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                              ~{pack.weightKgEstimate} kg ({pack.sheetsCount} sheets)
                            </span>
                          </div>
                          <div className="text-[11px] text-sky-400 font-semibold">
                            Zone: {pack.stagingZone}
                          </div>
                          <p className="text-slate-400 text-xs">
                            {pack.handlingInstruction}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trade Cutting Instructions */}
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Onsite Cutting &amp; Offcut Rules:
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs">
                      {stagingData.onsiteLeadingHandTips?.map((tip: string, i: number) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 4: MATERIAL BOM & COST */}
          {activeTab === 'bom_takeoff' && (
            <div className="space-y-4">
              {isLoadingBom ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  <span>Calculating complete bill of materials &amp; cost savings...</span>
                </div>
              ) : bomData ? (
                <div className="space-y-4">
                  {/* Financial KPI Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Roof Surface Area</div>
                      <div className="text-lg font-black text-white font-mono mt-0.5">
                        {bomData.totalAreaM2} m²
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Coil Run Ordered</div>
                      <div className="text-lg font-black text-sky-400 font-mono mt-0.5">
                        {bomData.totalOrderedMetres} lm
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Estimated Steel Cost</div>
                      <div className="text-lg font-black text-white font-mono mt-0.5">
                        ${bomData.estimatedSteelCostNZD?.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Offcut Savings Value</div>
                      <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                        ${bomData.estimatedSavingsNZD?.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3">Item Specification</th>
                          <th className="py-2.5 px-3">Quantity</th>
                          <th className="py-2.5 px-3">Unit Cost</th>
                          <th className="py-2.5 px-3">Total (NZD)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {bomData.lineItems?.map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-3 font-bold text-white">{row.category}</td>
                            <td className="py-2.5 px-3 text-slate-300">
                              <div>{row.item}</div>
                              <div className="text-[10px] text-slate-500">{row.notes}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-white">{row.quantity}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">{row.unitCost}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-sky-400">
                              ${row.totalCostNZD?.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
