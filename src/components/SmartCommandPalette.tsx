import React, { useState, useEffect, useRef } from 'react';
import { Quote, Project, Lead } from '../types/crm';
import { formatNZD } from '../utils/formatters';
import { 
  Search, 
  Sparkles, 
  ShieldCheck, 
  FileText, 
  User, 
  Building, 
  Download, 
  ExternalLink, 
  ArrowRight,
  X,
  Command,
  Plus,
  Compass
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quotes: Quote[];
  projects: Project[];
  leads: Lead[];
  onSelectQuote?: (quoteId: string) => void;
  onSelectProject?: (projectId: string) => void;
  onSelectLead?: (leadId: string) => void;
  onOpenExactRoofing?: () => void;
  onOpenSmartTakeoff?: () => void;
  onOpenCodeAudit?: () => void;
  onOpenAIPolisher?: () => void;
  onExportExcel?: () => void;
}

export const SmartCommandPalette: React.FC<Props> = ({
  isOpen,
  onClose,
  quotes,
  projects,
  leads,
  onSelectQuote,
  onSelectProject,
  onSelectLead,
  onOpenExactRoofing,
  onOpenSmartTakeoff,
  onOpenCodeAudit,
  onOpenAIPolisher,
  onExportExcel
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Global keyboard shortcut listener for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  // Filter quotes
  const filteredQuotes = quotes.filter(quote => 
    !q || 
    quote.quoteNumber.toLowerCase().includes(q) ||
    quote.clientName.toLowerCase().includes(q) ||
    quote.siteAddress.toLowerCase().includes(q) ||
    (quote.profile && quote.profile.toLowerCase().includes(q))
  ).slice(0, 4);

  // Filter projects
  const filteredProjects = projects.filter(proj =>
    !q ||
    proj.title.toLowerCase().includes(q) ||
    proj.clientName.toLowerCase().includes(q) ||
    proj.siteAddress.toLowerCase().includes(q)
  ).slice(0, 3);

  // Filter leads
  const filteredLeads = leads.filter(lead => 
    !q || 
    lead.clientName.toLowerCase().includes(q) ||
    lead.projectAddress.toLowerCase().includes(q) ||
    (lead.companyOrArchitect && lead.companyOrArchitect.toLowerCase().includes(q))
  ).slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-2xs flex items-start justify-center pt-20 p-4">
      <div 
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden text-xs flex flex-col max-h-[80vh] animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search quotes, projects, architects, or type smart commands..."
            className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button 
              type="button" 
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="text-[10px] font-mono font-semibold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-500 shrink-0">
            ESC to close
          </span>
        </div>

        {/* Results Body */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {/* Quick Smart Actions */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
              Smart Actions &amp; Tools
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {onOpenExactRoofing && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenExactRoofing();
                    onClose();
                  }}
                  className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/40 hover:border-blue-400 hover:bg-blue-50 flex items-center gap-2.5 text-left transition-all cursor-pointer group"
                >
                  <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs group-hover:bg-blue-700 transition-colors">
                    <Compass className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-black text-slate-900 block text-xs flex items-center gap-1.5">
                      <span>Exact Roofing Engine</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-bold">AI CAD</span>
                    </span>
                    <span className="text-[11px] text-slate-500">Plan Canvas, 3D model &amp; offcuts</span>
                  </div>
                </button>
              )}

              {onOpenSmartTakeoff && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSmartTakeoff();
                    onClose();
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 flex items-center gap-2.5 text-left transition-all cursor-pointer group"
                >
                  <div className="p-1.5 bg-sky-100 text-sky-700 rounded-lg group-hover:bg-sky-700 group-hover:text-white transition-colors">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Smart Scope Takeoff</span>
                    <span className="text-[11px] text-slate-500">Auto-calculate trays, flashings &amp; clips</span>
                  </div>
                </button>
              )}

              {onOpenCodeAudit && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenCodeAudit();
                    onClose();
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 flex items-center gap-2.5 text-left transition-all cursor-pointer group"
                >
                  <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">NZBC Code Audit</span>
                    <span className="text-[11px] text-slate-500">Live slope, wind &amp; durability check</span>
                  </div>
                </button>
              )}

              {onOpenAIPolisher && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenAIPolisher();
                    onClose();
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 flex items-center gap-2.5 text-left transition-all cursor-pointer group"
                >
                  <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg group-hover:bg-purple-700 group-hover:text-white transition-colors">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">AI Proposal Polisher</span>
                    <span className="text-[11px] text-slate-500">Tailored cover letter generator</span>
                  </div>
                </button>
              )}

              {onExportExcel && (
                <button
                  type="button"
                  onClick={() => {
                    onExportExcel();
                    onClose();
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-100 flex items-center gap-2.5 text-left transition-all cursor-pointer group"
                >
                  <div className="p-1.5 bg-slate-100 text-slate-700 rounded-lg group-hover:bg-slate-800 group-hover:text-white transition-colors">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Export to Excel</span>
                    <span className="text-[11px] text-slate-500">Download formatted CSV matrix</span>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Quotes Section */}
          {filteredQuotes.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
                Quotes ({filteredQuotes.length})
              </span>
              <div className="space-y-1.5">
                {filteredQuotes.map((qItem) => (
                  <div
                    key={qItem.id}
                    onClick={() => {
                      if (onSelectQuote) onSelectQuote(qItem.id);
                      onClose();
                    }}
                    className="p-2.5 rounded-xl hover:bg-slate-100 flex items-center justify-between cursor-pointer transition-colors border border-transparent hover:border-slate-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{qItem.quoteNumber}</span>
                          <span className="text-slate-400">·</span>
                          <span className="font-semibold text-slate-700">{qItem.clientName}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
                            qItem.status === 'accepted' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {qItem.status}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          {qItem.siteAddress} · {qItem.profile} ({qItem.roofAreaM2} m²)
                        </span>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-slate-900 text-xs">
                      {formatNZD(qItem.totalNZD)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects Section */}
          {filteredProjects.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
                Projects ({filteredProjects.length})
              </span>
              <div className="space-y-1.5">
                {filteredProjects.map((pItem) => (
                  <div
                    key={pItem.id}
                    onClick={() => {
                      if (onSelectProject) onSelectProject(pItem.id);
                      onClose();
                    }}
                    className="p-2.5 rounded-xl hover:bg-slate-100 flex items-center justify-between cursor-pointer transition-colors border border-transparent hover:border-slate-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">{pItem.title}</span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          {pItem.clientName} · {pItem.siteAddress}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      {pItem.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Tip: Press <strong>Cmd+K</strong> or <strong>Ctrl+K</strong> anywhere in the app to open</span>
          <span>Archtech Intelligence System</span>
        </div>
      </div>
    </div>
  );
};
