import React from 'react';
import { Quote } from '../types/crm';
import { 
  runCodeComplianceAudit, 
  ComplianceIssue, 
  QuoteAuditResult 
} from '../utils/smartRoofingEngine';
import { 
  ShieldCheck, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Wrench, 
  ExternalLink, 
  Sparkles,
  Info,
  Check
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeQuote: Quote;
  onApplyFixPatch: (patch: Partial<Quote>, successMessage: string) => void;
  onApplyAllFixes: () => void;
}

export const SmartComplianceAuditorDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  activeQuote,
  onApplyFixPatch,
  onApplyAllFixes
}) => {
  if (!isOpen) return null;

  const audit: QuoteAuditResult = runCodeComplianceAudit(activeQuote);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-2xs flex items-center justify-end">
      <div className="bg-white w-full max-w-xl h-full shadow-2xl border-l border-slate-200 flex flex-col text-xs animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${
              audit.status === 'compliant'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : audit.status === 'warning'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
            }`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">NZBC E2/AS1 Code &amp; Durability Auditor</h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  audit.status === 'compliant'
                    ? 'bg-emerald-400/20 text-emerald-300'
                    : audit.status === 'warning'
                    ? 'bg-amber-400/20 text-amber-300'
                    : 'bg-rose-400/20 text-rose-300'
                }`}>
                  {audit.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Automated engineering check for {activeQuote.quoteNumber} (v{activeQuote.version || 1}.0)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Score Ribbon */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold font-mono text-base ${
              audit.overallScore >= 90
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : audit.overallScore >= 70
                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-rose-100 text-rose-800 border border-rose-200'
            }`}>
              {audit.overallScore}%
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Engineering Compliance Index</span>
              <span className="text-[11px] text-slate-500">
                {audit.passedChecksCount} of {audit.totalChecksCount} mandatory architectural benchmarks met
              </span>
            </div>
          </div>

          {audit.issues.length > 0 && (
            <button
              type="button"
              onClick={onApplyAllFixes}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Wrench className="w-3.5 h-3.5 text-sky-400" />
              <span>1-Click Auto-Fix All</span>
            </button>
          )}
        </div>

        {/* Issues & Benchmark Checks List */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {audit.issues.length === 0 ? (
            <div className="p-6 text-center space-y-2 bg-emerald-50/60 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-emerald-950 text-sm">Flawless Architectural Specification</h4>
              <p className="text-[11px] text-emerald-900/80 max-w-sm mx-auto leading-relaxed">
                This quote satisfies all NZBC E2/AS1 Table 7 minimum slope criteria, NZS 3604 environmental coating durability standards, AS/NZS 1170.2 wind uplift tolerances, and thermal expansion sliding clip rules.
              </p>
            </div>
          ) : (
            audit.issues.map((issue: ComplianceIssue) => {
              const isCrit = issue.severity === 'critical';
              const isWarn = issue.severity === 'warning';

              return (
                <div 
                  key={issue.id} 
                  className={`p-4 rounded-xl border space-y-2.5 transition-all ${
                    isCrit 
                      ? 'bg-rose-50/70 border-rose-200 text-rose-950' 
                      : isWarn 
                      ? 'bg-amber-50/70 border-amber-200 text-amber-950' 
                      : 'bg-sky-50/70 border-sky-200 text-sky-950'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {isCrit ? (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      ) : isWarn ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs">{issue.title}</span>
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-white/80 rounded border border-current opacity-80">
                            {issue.codeReference}
                          </span>
                        </div>
                        <p className="text-[11px] opacity-90 mt-1 leading-relaxed">
                          {issue.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recommendation & Auto-Fix */}
                  <div className="pt-2 border-t border-current/15 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex-1 min-w-[200px]">
                      <span className="font-semibold block">Architectural Recommendation:</span>
                      <span className="opacity-90">{issue.recommendation}</span>
                    </div>

                    {issue.autoFixLabel && issue.appliedFixPatch && (
                      <button
                        type="button"
                        onClick={() => {
                          onApplyFixPatch(issue.appliedFixPatch!, `Applied auto-fix: ${issue.autoFixLabel}`);
                        }}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors shrink-0 ${
                          isCrit
                            ? 'bg-rose-700 hover:bg-rose-800 text-white'
                            : isWarn
                            ? 'bg-amber-700 hover:bg-amber-800 text-white'
                            : 'bg-sky-700 hover:bg-sky-800 text-white'
                        }`}
                      >
                        <Wrench className="w-3 h-3" />
                        <span>{issue.autoFixLabel}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Standard Architecture Standards Reference Card */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-slate-600">
            <span className="font-bold text-slate-900 block text-xs">
              Key Standards &amp; New Zealand Accreditations Enforced
            </span>
            <ul className="space-y-1.5 text-[11px]">
              <li className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>NZBC E2/AS1 Clause 8:</strong> External moisture minimum falls, upstands &amp; anti-capillary details.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>NZMRM Code of Practice:</strong> Thermal expansion calculation (1.2mm/m) and two-piece sliding cleat spacing.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>The Roofing Store Technical Bulletin:</strong> MagnaFlow® 25-Year Marine Durability in Exposure Zone D.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>LBP Regime (Marcus Kuhtze BP134821):</strong> Producer Statement PS3 Construction compliance for Council CCC.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">
            Audit Engine v3.2 · Real-Time
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
