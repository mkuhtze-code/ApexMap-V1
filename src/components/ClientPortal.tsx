import React, { useState, useMemo } from 'react';
import { 
  Project, 
  Quote, 
  ProjectInvoice, 
  MasterPricingCatalogue,
  QuoteStatus,
  QuoteAuditEntry,
  ProjectProgressNote,
  SitePhoto,
  ProjectClientDocument,
  SpreadsheetSection,
  SpreadsheetRow
} from '../types/crm';
import { formatNZD, formatDate } from '../utils/formatters';
import { 
  getEffectiveQuoteStatus, 
  isQuoteExpired, 
  getDaysUntilExpiry,
  acceptQuoteByClient
} from '../utils/quoteVersioning';
import { ArchitecturalSvgDiagram } from './ArchitecturalSvgDiagram';
import { ArchtechLogo } from './ArchtechLogo';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  ShieldCheck, 
  Download, 
  Phone, 
  Mail, 
  Check, 
  X,
  ExternalLink,
  Camera,
  Ruler,
  Droplets,
  Compass,
  FileText,
  DollarSign,
  AlertTriangle,
  Lock,
  ArrowRight,
  History,
  Info,
  Calendar,
  Send,
  Eye,
  KeyRound,
  FileCheck,
  ChevronRight,
  Layers,
  MapPin,
  Building,
  RotateCcw,
  Copy,
  TrendingUp,
  Receipt
} from 'lucide-react';

interface Props {
  projects: Project[];
  activeProjectId?: string;
  quotes?: Quote[];
  activeQuoteId?: string;
  clientToken?: string;
  catalogue?: MasterPricingCatalogue;
  onUpdateProject: (updated: Project) => void;
  onUpdateQuote?: (updated: Quote) => void;
  onAddQuote?: (newQuote: Quote) => void;
  onReturnToStaff: () => void;
}

export type PortalSection = 'quotes' | 'financials' | 'progress' | 'dates' | 'documents' | 'audit';

export const ClientPortal: React.FC<Props> = ({
  projects,
  activeProjectId,
  quotes = [],
  activeQuoteId,
  clientToken,
  catalogue,
  onUpdateProject,
  onUpdateQuote,
  onAddQuote,
  onReturnToStaff,
}) => {
  // 1. Project Selection
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    if (activeProjectId) return activeProjectId;
    if (activeQuoteId) {
      const q = quotes.find(item => item.id === activeQuoteId);
      if (q?.projectId) return q.projectId;
    }
    return projects[0]?.id || '';
  });

  const project = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) || projects[0];
  }, [projects, selectedProjectId]);

  // Quotes relevant to this project
  const projectQuotes = useMemo(() => {
    if (!project) return [];
    return quotes.filter(q => 
      q.projectId === project.id || 
      (q.leadId && q.leadId === project.leadId) ||
      (q.clientEmail && q.clientEmail.toLowerCase() === project.clientEmail?.toLowerCase())
    ).sort((a, b) => (b.version || 1) - (a.version || 1));
  }, [quotes, project]);

  // Active Quote selection
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(() => {
    if (activeQuoteId) return activeQuoteId;
    if (project?.currentAcceptedQuoteId) return project.currentAcceptedQuoteId;
    return projectQuotes[0]?.id || '';
  });

  const activeQuote = useMemo(() => {
    return projectQuotes.find(q => q.id === selectedQuoteId) || projectQuotes[0];
  }, [projectQuotes, selectedQuoteId]);

  // Account Activation & View Mode
  // CORE PRINCIPLE: Full portal access is granted only after a quote is accepted.
  const isAccountActive = Boolean(project?.clientAccountActivated || activeQuote?.status === 'accepted');
  const [viewQuoteMode, setViewQuoteMode] = useState<boolean>(!isAccountActive);
  const [activeSection, setActiveSection] = useState<PortalSection>('financials');

  // Modals
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [isRequestPricingModalOpen, setIsRequestPricingModalOpen] = useState(false);
  const [isRequestAmendmentModalOpen, setIsRequestAmendmentModalOpen] = useState(false);

  // Acceptance Form State
  const [signerName, setSignerName] = useState(project?.clientName || '');
  const [signerEmail, setSignerEmail] = useState(project?.clientEmail || '');
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [requestNote, setRequestNote] = useState('');

  // Toast Feedback
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 4500);
  };

  const handleCopySecureLink = () => {
    if (!activeQuote) return;
    const url = `${window.location.origin}/?quoteId=${activeQuote.id}&token=${activeQuote.clientToken || 'sec_token'}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
      showToast('Secure pre-account quote viewing link copied to clipboard.', 'success');
    }).catch(() => {
      showToast('Secure quote link: ' + url, 'info');
    });
  };

  if (!project) {
    return (
      <div className="p-12 text-center text-slate-500 font-sans">
        No active project found for client portal.
      </div>
    );
  }

  // Quote Status and Expiry Calculations (30-day validity rule)
  const effectiveQuoteStatus: QuoteStatus = activeQuote ? getEffectiveQuoteStatus(activeQuote) : 'draft';
  const isExpired = activeQuote ? (effectiveQuoteStatus === 'expired' || isQuoteExpired(activeQuote)) : false;
  const daysRemaining = activeQuote ? getDaysUntilExpiry(activeQuote) : 30;
  const isAccepted = effectiveQuoteStatus === 'accepted';
  const isSuperseded = effectiveQuoteStatus === 'superseded';
  const isDeclined = effectiveQuoteStatus === 'declined';

  // WHILE VALID -> Client sees Accept / Decline.
  // AFTER EXPIRY -> Accept/Decline REMOVED. Client ONLY sees "Request current pricing" or "Request amendment".
  const canAcceptOrDecline = activeQuote && ['sent', 'viewed', 'viewed_by_client'].includes(effectiveQuoteStatus) && !isExpired && !activeQuote.isLocked;

  // Running Financials: derived from accepted quote(s)
  const agreedContractTotal = project.contractValueNZD || (isAccepted ? activeQuote?.totalNZD : 0) || 0;
  const projectInvoices = project.invoices || [];
  const totalInvoiced = projectInvoices.reduce((sum, inv) => sum + (inv.totalNZD || 0), 0);
  const totalPaid = projectInvoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.totalNZD || 0), 0);
  const balanceRemaining = Math.max(0, agreedContractTotal - totalPaid);

  // Visibility Settings (controlled per project by Project Manager / Admin)
  // SENSITIVE: Estimated completion date defaults to hidden!
  const vis = project.visibilitySettings || {
    photos: true,
    deliveryDate: true,
    installStartDate: true,
    estimatedCompletionDate: false,
    documents: true
  };

  // Approved Progress Notes & Photos Only (Gate Rule)
  const approvedProgressNotes: ProjectProgressNote[] = (project.publicProgressNotes || []).filter(n => n.isPublicToClient);
  const approvedPhotos: SitePhoto[] = project.photos || [];

  // Acceptance Handler: locks version + price, activates full portal access
  const handleConfirmAcceptQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuote || !termsAgreed || !signerName.trim() || !signerEmail.trim()) {
      showToast('Please confirm all required authorization fields and agree to the contract terms.', 'error');
      return;
    }

    try {
      const { updatedQuote, updatedProject } = acceptQuoteByClient(
        activeQuote,
        signerName.trim(),
        signerEmail.trim(),
        `Digitally Accepted by ${signerName.trim()}`,
        project
      );

      const activatedProject: Project = {
        ...updatedProject,
        clientAccountActivated: true,
        contractValueNZD: activeQuote.totalNZD,
        currentAcceptedQuoteId: activeQuote.id
      };

      if (onUpdateQuote) onUpdateQuote(updatedQuote);
      onUpdateProject(activatedProject);

      setIsAcceptModalOpen(false);
      setViewQuoteMode(false);
      setActiveSection('financials');
      showToast(`Contract ${activeQuote.quoteNumber} accepted & locked! Full Archtech Client Portal is now active.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to accept quote.', 'error');
    }
  };

  const handleConfirmDeclineQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuote) return;

    const nowIso = new Date().toISOString();
    const auditEntry: QuoteAuditEntry = {
      id: `aud-${Date.now()}-dec`,
      timestamp: nowIso,
      action: 'declined',
      actor: signerName || project.clientName,
      actorType: 'client',
      details: `Client declined quote. Reason: ${declineReason || 'No specific reason provided.'}`,
      versionNumber: activeQuote.version || 1
    };

    const updatedQuote: Quote = {
      ...activeQuote,
      status: 'declined',
      declinedReason: declineReason,
      auditTrail: [auditEntry, ...(activeQuote.auditTrail || [])]
    };

    if (onUpdateQuote) onUpdateQuote(updatedQuote);
    setIsDeclineModalOpen(false);
    showToast('Quote marked as declined. Our estimating team will follow up.', 'info');
  };

  const handleRequestPricing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuote) return;

    const nowIso = new Date().toISOString();
    const auditEntry: QuoteAuditEntry = {
      id: `aud-${Date.now()}-rq`,
      timestamp: nowIso,
      action: 'amendment_requested',
      actor: project.clientName,
      actorType: 'client',
      details: `Client requested updated matrix pricing on expired quote (${activeQuote.quoteNumber}). Notes: ${requestNote || 'Refresh pricing requested.'}`,
      versionNumber: activeQuote.version || 1
    };

    const updatedQuote: Quote = {
      ...activeQuote,
      clientAmendmentRequest: `[Pricing Refresh Requested ${nowIso.slice(0, 10)}]: ${requestNote || 'Please update pricing to current price matrix schedule.'}`,
      auditTrail: [auditEntry, ...(activeQuote.auditTrail || [])]
    };

    if (onUpdateQuote) onUpdateQuote(updatedQuote);
    setIsRequestPricingModalOpen(false);
    setRequestNote('');
    showToast('Current pricing request submitted to estimating team. A new dated version will be generated.', 'success');
  };

  const handleRequestAmendment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuote || !requestNote.trim()) return;

    const nowIso = new Date().toISOString();
    const auditEntry: QuoteAuditEntry = {
      id: `aud-${Date.now()}-amend`,
      timestamp: nowIso,
      action: 'amendment_requested',
      actor: project.clientName,
      actorType: 'client',
      details: `Client requested scope amendment on ${activeQuote.quoteNumber}: ${requestNote}`,
      versionNumber: activeQuote.version || 1
    };

    const updatedQuote: Quote = {
      ...activeQuote,
      clientAmendmentRequest: requestNote,
      auditTrail: [auditEntry, ...(activeQuote.auditTrail || [])]
    };

    if (onUpdateQuote) onUpdateQuote(updatedQuote);
    setIsRequestAmendmentModalOpen(false);
    setRequestNote('');
    showToast('Scope amendment request submitted. Staff will issue a new dated version.', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 font-sans">
      {/* ----------------------------------------------------------------- */}
      {/* HEADER: BRANDING, STATUS & CONTEXT                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-3">
              <ArchtechLogo variant="dark" className="h-9 w-auto object-left" />
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold uppercase tracking-wider">
                Client Portal
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
              <span className="font-bold text-slate-200">{project.projectNumber}</span>
              <span>·</span>
              <span>{project.siteAddress}</span>
              <span>·</span>
              <span className="text-slate-300">{project.clientName}</span>
            </div>
            
            <h1 className="text-xl sm:text-2xl font-bold mt-1 text-white tracking-tight">
              {project.title}
            </h1>
          </div>

          {/* Quick Access Switches & Staff Exit */}
          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg bg-slate-800 p-1 border border-slate-700">
              <button
                type="button"
                onClick={() => setViewQuoteMode(true)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewQuoteMode 
                    ? 'bg-amber-500 text-slate-950 shadow-xs' 
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Quote Document</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isAccountActive) {
                    showToast('Full portal access is activated upon quote acceptance. Review the quote below to authorize.', 'info');
                  }
                  setViewQuoteMode(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                  !viewQuoteMode 
                    ? 'bg-amber-500 text-slate-950 shadow-xs' 
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Active Project Hub</span>
              </button>
            </div>

            <button
              onClick={handleCopySecureLink}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Copy secure link to view quote without login"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
            </button>

            <button
              onClick={onReturnToStaff}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              Exit to Staff CRM
            </button>
          </div>
        </div>

        {/* Global Security & Trust Banner */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>High-Trust Guarantee: Quotes are versioned and immutable. Only approved progress is published.</span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            {isAccountActive ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Portal Activated (Accepted Commercial Reference Locked)
              </span>
            ) : (
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Pre-Acceptance Mode (Sign quote below to activate full portal)
              </span>
            )}
          </div>
        </div>
      </div>

      {feedbackMessage && (
        <div className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 transition-all shadow-xs ${
          feedbackMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : feedbackMessage.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : 'bg-sky-50 border-sky-200 text-sky-900'
        }`}>
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : feedbackMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-sky-600 shrink-0" />
          )}
          <span className="font-semibold">{feedbackMessage.text}</span>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODE 1: QUOTE DOCUMENT & 30-DAY VALIDITY / ACCEPTANCE JOURNEY     */}
      {/* ----------------------------------------------------------------- */}
      {viewQuoteMode && (
        <div className="space-y-6">
          {/* Quote Version Switcher Ribbon */}
          {projectQuotes.length > 0 && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                <span className="font-bold text-slate-800">Available Quote Versions:</span>
                <span className="text-slate-500 hidden sm:inline">Each version is immutable with a 30-day validity window.</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {projectQuotes.map((q) => {
                  const isCurrent = q.id === activeQuote?.id;
                  const isSup = q.status === 'superseded';
                  const isAcc = q.status === 'accepted';
                  const isExp = q.status === 'expired' || isQuoteExpired(q);
                  return (
                    <button
                      key={q.id}
                      onClick={() => setSelectedQuoteId(q.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                        isCurrent
                          ? 'bg-slate-900 text-white font-bold shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <span>{q.quoteNumber}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-sans uppercase font-bold ${
                        isAcc 
                          ? 'bg-emerald-500 text-white' 
                          : isSup 
                          ? 'bg-slate-300 text-slate-800'
                          : isExp
                          ? 'bg-rose-500 text-white'
                          : 'bg-amber-400 text-slate-900'
                      }`}>
                        {isAcc ? 'Accepted' : isSup ? 'Superseded' : isExp ? 'Expired' : 'Current'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeQuote ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              {/* QUOTE STATUS BANNER */}
              {isSuperseded && (
                <div className="bg-slate-100 border-b border-slate-200 p-4 text-slate-800 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500 shrink-0" />
                    <div>
                      <span className="font-bold">This version is Superseded (v{activeQuote.version || 1})</span>
                      <p className="text-slate-600 mt-0.5">
                        A newer dated revision was issued on {activeQuote.supersededAt || 'site'}. Historical terms and pricing are locked.
                        {activeQuote.supersededReason && ` Reason: ${activeQuote.supersededReason}`}
                      </p>
                    </div>
                  </div>
                  {projectQuotes.find(q => q.status !== 'superseded') && (
                    <button
                      onClick={() => {
                        const latest = projectQuotes.find(q => q.status !== 'superseded');
                        if (latest) setSelectedQuoteId(latest.id);
                      }}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-bold hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                    >
                      View Latest Version →
                    </button>
                  )}
                </div>
              )}

              {isAccepted && (
                <div className="bg-emerald-50 border-b border-emerald-200 p-4 text-emerald-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold">Quote Accepted &amp; Commercial Reference Locked</span>
                      <p className="text-emerald-800 mt-0.5">
                        Accepted by {activeQuote.acceptedBy?.name || activeQuote.clientSignature || project.clientName} on {formatDate(activeQuote.signedAt || activeQuote.issueDate || '')}. Contract sum: {formatNZD(activeQuote.totalNZD)}. Price matrix updates will not affect this locked contract.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setViewQuoteMode(false)}
                      className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Open Active Project Hub</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {isExpired && (
                <div className="bg-rose-50 border-b border-rose-200 p-4 text-rose-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <span className="font-bold text-sm">Quote Validity Expired (30-Day Window Closed)</span>
                      <p className="text-rose-800 mt-0.5">
                        This quote had a 30-day validity window from {formatDate(activeQuote.issueDate || '')} to {formatDate(activeQuote.validUntil || activeQuote.expiresAt || '')}.
                        Because metal coil, coating, and transport rates fluctuate, Accept and Decline are removed. You can request current pricing or an amendment below.
                      </p>
                    </div>
                  </div>

                  {/* CORE PRINCIPLE: After expiry -> Accept/Decline removed. Client only sees "Request current pricing" or "Request amendment" */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setIsRequestPricingModalOpen(true)}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Request Current Pricing</span>
                    </button>
                    <button
                      onClick={() => setIsRequestAmendmentModalOpen(true)}
                      className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-bold text-xs cursor-pointer"
                    >
                      Request Amendment
                    </button>
                  </div>
                </div>
              )}

              {canAcceptOrDecline && (
                <div className="bg-sky-50 border-b border-sky-200 p-4 text-sky-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-700 shrink-0" />
                    <div>
                      <span className="font-bold">Active Official Proposal · {daysRemaining} days remaining in 30-day window</span>
                      <p className="text-sky-800 mt-0.5">
                        Valid until {formatDate(activeQuote.validUntil || activeQuote.expiresAt)}. Accepting locks this version and activates your full project hub.
                      </p>
                    </div>
                  </div>

                  {/* CORE PRINCIPLE: While valid -> Client sees Accept / Decline */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      onClick={() => setIsDeclineModalOpen(true)}
                      className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold text-xs transition-colors cursor-pointer"
                    >
                      Decline Quote
                    </button>
                    <button
                      onClick={() => setIsAcceptModalOpen(true)}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Accept &amp; Authorize Quote</span>
                    </button>
                  </div>
                </div>
              )}

              {/* DOCUMENT BODY */}
              <div className="p-6 sm:p-8 space-y-8">
                {/* Proposal Title Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
                      <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {activeQuote.quoteNumber}
                      </span>
                      <span>·</span>
                      <span>Version {activeQuote.version || 1}.0</span>
                      <span>·</span>
                      <span>Issued: {formatDate(activeQuote.issueDate || '')}</span>
                      <span>·</span>
                      <span>Valid 30 Days to {formatDate(activeQuote.validUntil || activeQuote.expiresAt)}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-2">
                      {activeQuote.title || project.title || 'Architectural Specification'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Architectural metal roofing &amp; wall cladding supply, fabrication, and certified installation.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-right font-mono shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Contract Sum (NZD)</span>
                    <span className="text-2xl font-bold text-slate-900 block mt-0.5">
                      {formatNZD(activeQuote.totalNZD)}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Subtotal: {formatNZD(activeQuote.subtotalNZD)} + 15% GST: {formatNZD(activeQuote.gstNZD)}
                    </span>
                  </div>
                </div>

                {/* Key Specifications Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Profile System</span>
                    <div className="font-bold text-slate-900 mt-0.5">{activeQuote.profile}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Material &amp; Coating</span>
                    <div className="font-bold text-slate-900 mt-0.5">{activeQuote.material}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Finish &amp; Color</span>
                    <div className="font-bold text-slate-900 mt-0.5">{activeQuote.colorName}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Measured Area</span>
                    <div className="font-bold text-slate-900 mt-0.5 font-mono">{activeQuote.roofAreaM2} m²</div>
                  </div>
                </div>

                {/* Architectural Diagram */}
                <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-800 block mb-2">Architectural Seam Geometry</span>
                  <ArchitecturalSvgDiagram profile={activeQuote.profile} />
                </div>

                {/* Scope of Works & Holistic Envelope Systems */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Scope of Works &amp; Architectural Envelopes
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Comprehensive material supply, precision roll-forming, workshop flashings, and certified installation.
                      </p>
                    </div>
                    {activeQuote.roofAreaM2 && activeQuote.roofAreaM2 > 0 && (
                      <span className="text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        Total Envelope: {activeQuote.roofAreaM2} m²
                      </span>
                    )}
                  </div>

                  {/* If custom Quote Sections & Rows exist (from QuoteBuilder) */}
                  {(activeQuote.quoteSections || activeQuote.spreadsheetSections) && ((activeQuote.quoteSections || activeQuote.spreadsheetSections)?.length || 0) > 0 && (activeQuote.quoteRows || activeQuote.spreadsheetRows) && ((activeQuote.quoteRows || activeQuote.spreadsheetRows)?.length || 0) > 0 ? (
                    <div className="space-y-3">
                      {(activeQuote.quoteSections || activeQuote.spreadsheetSections || []).map((section: SpreadsheetSection) => {
                        const allRows: SpreadsheetRow[] = activeQuote.quoteRows || activeQuote.spreadsheetRows || [];
                        const sectionRows = allRows.filter((r: SpreadsheetRow) => r.sectionId === section.id);
                        if (sectionRows.length === 0) return null;
                        const sectionTotal = sectionRows.reduce((sum: number, r: SpreadsheetRow) => sum + (r.totalNZD || 0), 0);
                        const cleanTitle = section.title.replace(/^(\d+[\.\-\)]\s*|Section\s*\d+\s*[\:\-]\s*)/i, '').trim();

                        return (
                          <div key={section.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-900 text-xs">{cleanTitle}</span>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span>{sectionRows.length} scheduled component{sectionRows.length === 1 ? '' : 's'}</span>
                                  {section.totalM2 && section.totalM2 > 0 && (
                                    <>
                                      <span>·</span>
                                      <span className="font-mono">{section.totalM2} m² area</span>
                                    </>
                                  )}
                                  {section.defaultMaterial && (
                                    <>
                                      <span>·</span>
                                      <span>{section.defaultMaterial}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="font-mono font-bold text-slate-900 text-xs">
                                {formatNZD(sectionTotal)}
                              </div>
                            </div>

                            <div className="divide-y divide-slate-100 text-xs">
                              {sectionRows.map((row: SpreadsheetRow) => (
                                <div key={row.id} className="p-3.5 flex items-start justify-between gap-4 hover:bg-slate-50/50">
                                  <div>
                                    <span className="font-medium text-slate-900 block">{row.description}</span>
                                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                      <span className="font-mono">{row.quantity} {row.unit}</span>
                                      {row.material && (
                                        <>
                                          <span>·</span>
                                          <span>{row.material}</span>
                                        </>
                                      )}
                                      {row.profile && (
                                        <>
                                          <span>·</span>
                                          <span>{row.profile}</span>
                                        </>
                                      )}
                                      {row.panSizeMm && (
                                        <>
                                          <span>·</span>
                                          <span>{row.panSizeMm}mm pan</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="font-mono font-bold text-slate-900 text-right shrink-0">
                                    {formatNZD(row.totalNZD || 0)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : activeQuote.scopeZones && activeQuote.scopeZones.length > 0 ? (
                    /* If scopeZones exist (e.g. from initial architectural data) */
                    <div className="space-y-3">
                      {activeQuote.scopeZones.map((zone) => (
                        <div key={zone.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white p-4 shadow-2xs">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-xs">{zone.title}</span>
                                <span className="text-[10px] font-semibold bg-sky-50 text-sky-700 px-2 py-0.5 rounded border border-sky-200">
                                  {zone.application}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-1">
                                {zone.profile} · {zone.material} · {zone.colorName}
                              </p>
                              {zone.notes && (
                                <p className="text-[11px] text-slate-600 mt-1.5 italic">
                                  "{zone.notes}"
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 mt-2">
                                <span>Area: <strong className="text-slate-800">{zone.areaM2} m²</strong></span>
                                <span>·</span>
                                <span>Pan: <strong className="text-slate-800">{zone.trayPanWidthMm}mm</strong></span>
                                <span>·</span>
                                <span>Pitch: <strong className="text-slate-800">{zone.pitchDegrees}°</strong></span>
                                <span>·</span>
                                <span>Trays: <strong className="text-slate-800">{zone.calculatedLinearMetres} lm</strong></span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-slate-900 text-sm block">
                                {formatNZD(zone.totalNZD)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                @ {formatNZD(zone.ratePerLm)}/lm
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Flashings breakdown if present */}
                      {activeQuote.flashings && activeQuote.flashings.length > 0 && (
                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white p-4 shadow-2xs">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-bold text-slate-900 text-xs">Workshop Folded Perimeter Flashings</span>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Custom fabricated flashings folded per NZBC E2/AS1 girth tiers and site dimensions.
                              </p>
                            </div>
                            <div className="font-mono font-bold text-slate-900 text-xs">
                              {formatNZD(activeQuote.flashings.reduce((sum, f) => sum + (f.totalNZD || 0), 0))}
                            </div>
                          </div>
                          <div className="divide-y divide-slate-100 mt-2 text-[11px]">
                            {activeQuote.flashings.map((fl) => (
                              <div key={fl.id} className="py-2 flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-slate-800">{fl.name}</span>
                                  <span className="text-slate-500 ml-2">({fl.girthTier}, {fl.lengthLm} lm, {fl.foldsCount} folds)</span>
                                </div>
                                <span className="font-mono text-slate-700">{formatNZD(fl.totalNZD || 0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Clean Fallback Package View */
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs bg-white">
                      <div className="p-3.5 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900">
                            {activeQuote.profile} Roll-Formed Trays ({activeQuote.material})
                          </span>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            Supply of custom length standing seam trays manufactured from coil stock to exact site measurements.
                          </p>
                        </div>
                        <div className="font-mono font-bold text-slate-900 text-right">
                          {formatNZD(activeQuote.materialTotalNZD || activeQuote.materialCostNZD || 0)}
                        </div>
                      </div>

                      {activeQuote.flashingsTotalNZD && activeQuote.flashingsTotalNZD > 0 && (
                        <div className="p-3.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">Custom Architectural Folded Flashings</span>
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              Ridge, barge, apron, and gutter flashings fabricated in workshop per size band and girth tiers.
                            </p>
                          </div>
                          <div className="font-mono font-bold text-slate-900 text-right">
                            {formatNZD(activeQuote.flashingsTotalNZD)}
                          </div>
                        </div>
                      )}

                      {activeQuote.labourTotalNZD && activeQuote.labourTotalNZD > 0 && (
                        <div className="p-3.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">Certified Trade Installation &amp; Seaming</span>
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              Synthetic underlay installation, clip fixing, mechanical seaming, and LBP site supervision.
                            </p>
                          </div>
                          <div className="font-mono font-bold text-slate-900 text-right">
                            {formatNZD(activeQuote.labourTotalNZD)}
                          </div>
                        </div>
                      )}

                      {activeQuote.hardwareTotalNZD && activeQuote.hardwareTotalNZD > 0 && (
                        <div className="p-3.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">Stainless Steel Fixing Clips &amp; Fasteners</span>
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              Sliding expansion cleats, low-profile screws, butyl sealants, and foam infills.
                            </p>
                          </div>
                          <div className="font-mono font-bold text-slate-900 text-right">
                            {formatNZD(activeQuote.hardwareTotalNZD)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Scope Inclusions & Exclusions Schedules */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Inclusions */}
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-900 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Scope Inclusions &amp; Deliverables</span>
                    </div>
                    <ul className="space-y-2 text-[11px] text-emerald-950/80">
                      {(activeQuote.proposalInclusions && activeQuote.proposalInclusions.length > 0 
                        ? activeQuote.proposalInclusions 
                        : [
                            'Precision continuous roll-forming of architectural standing seam trays manufactured to verified site lengths in specified 0.55mm coil substrate.',
                            'Workshop custom fabrication of all matching perimeter, ridge vent, barge roll, apron, abutment, and penetration flashings per NZMRM specifications.',
                            'Concealed marine-grade 316 stainless steel two-piece thermal expansion sliding clips allowing unrestricted expansion/contraction.',
                            'High-performance synthetic micro-porous breathable roof underlay membrane with 150mm taped laps for secondary condensation control.',
                            'Double-lock mechanical standing seam closing with calibrated trade tooling by qualified sheet metal craftsmen.',
                            'Auckland Council / Territorial Authority Producer Statement PS3 documentation provided upon completion for Code Compliance Certificate (CCC).'
                          ]
                      ).map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Exclusions */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-2">
                      <X className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Clarifications &amp; Scope Exclusions</span>
                    </div>
                    <ul className="space-y-2 text-[11px] text-slate-600">
                      {(activeQuote.proposalExclusions && activeQuote.proposalExclusions.length > 0 
                        ? activeQuote.proposalExclusions 
                        : [
                            'Supply, installation, or structural framing remediation of CD plywood substrate, trusses, or timber purlins (by builder).',
                            'Electrical or plumbing disconnection, reconnection, or certification (e.g. solar PV panels, HVAC, heat pumps, TV aerials).',
                            'Territorial Authority Building Consent application, vetting, inspection, or council processing fees (by owner / architect).',
                            'Scaffolding or edge protection above standard 2-storey scope unless separately scheduled in Preliminaries.',
                            'Rectification of existing non-compliant roof framing pitch, drainage sumps, or framing falls below the 3° minimum requirement.'
                          ]
                      ).map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Fergus / NZ Construction Contracts Act (CCA 2002) Payment Milestones */}
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">
                        Payment Milestones (NZ Construction Contracts Act 2002)
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Progress payment schedule structured to track manufacturing milestones and site completion.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      CCA Compliant
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
                    {(activeQuote.proposalPaymentMilestones && activeQuote.proposalPaymentMilestones.length > 0
                      ? activeQuote.proposalPaymentMilestones
                      : [
                          { stage: '1. Deposit & Allocation', percentage: 20, description: 'Secures coil slit reservation from The Roofing Store' },
                          { stage: '2. Delivery & Dry-in', percentage: 30, description: 'Trays delivered to site & underlay membrane installed' },
                          { stage: '3. Laying & Seaming', percentage: 35, description: 'Trays fastened, seams double-locked, and flashings fitted' },
                          { stage: '4. Council PS3 Sign-off', percentage: 15, description: 'Producer Statement PS3 issued for Council CCC application' }
                        ]
                    ).map((m, idx) => {
                      const amount = (activeQuote.totalNZD * m.percentage) / 100;
                      return (
                        <div key={idx} className="p-3 bg-slate-50/70 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 text-[11px]">{m.stage}</span>
                            <span className="font-mono font-bold text-sky-700 text-[11px]">{m.percentage}%</span>
                          </div>
                          <div className="font-mono font-bold text-slate-900 text-sm mt-1">
                            {formatNZD(amount)}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                            {m.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Audit & Validity Notice Footer */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Archtech Quality &amp; Weather Guarantee</span>
                  </div>
                  <p>
                    All works installed strictly in accordance with NZMRM Code of Practice and manufacturer specifications. 
                    Quote is legally binding upon digital acceptance and locks material supply rates.
                  </p>
                  <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>Quote Token: {activeQuote.clientToken || 'sec_token_active'}</span>
                    <span>Valid Through: {formatDate(activeQuote.validUntil || activeQuote.expiresAt)}</span>
                  </div>
                </div>

                {/* Bottom Acceptance Bar if valid */}
                {canAcceptOrDecline && (
                  <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
                    <div className="text-xs text-slate-500">
                      <span>Ready to lock this version and authorize fabrication?</span>
                      <span className="block font-medium text-slate-800">
                        Total investment: {formatNZD(activeQuote.totalNZD)} (incl. 15% GST)
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsDeclineModalOpen(true)}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs cursor-pointer"
                      >
                        Decline Quote
                      </button>
                      <button
                        onClick={() => setIsAcceptModalOpen(true)}
                        className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        <span>Accept &amp; Authorize Contract</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
              No quote selected. Choose a quote from the versions above.
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODE 2: ACTIVE CLIENT PORTAL HUB (ACTIVATED ONLY AFTER ACCEPTANCE) */}
      {/* ----------------------------------------------------------------- */}
      {!viewQuoteMode && (
        <div className="space-y-6">
          {/* Pre-acceptance Gate Check */}
          {!isAccountActive ? (
            <div className="bg-white rounded-2xl border border-amber-200 p-8 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-lg font-bold text-slate-900">
                  Full Project Portal Activates Upon Quote Acceptance
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your live claim financials, approved site progress updates, dates, and warranties become active once Quote {activeQuote?.quoteNumber || ''} is accepted and authorized.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setViewQuoteMode(true)}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Review &amp; Authorize Quote Document</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Navigation Tabs Bar: Exact 5 Sections + Audit */}
              <div className="bg-white p-2 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-1.5 shadow-2xs">
                {/* 1. Financials */}
                <button
                  onClick={() => setActiveSection('financials')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    activeSection === 'financials'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Financials &amp; Claims</span>
                </button>

                {/* 2. Quotes */}
                <button
                  onClick={() => setActiveSection('quotes')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    activeSection === 'quotes'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Quotes ({projectQuotes.length})</span>
                </button>

                {/* 3. Progress (Approved notes and photos only) */}
                <button
                  onClick={() => setActiveSection('progress')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    activeSection === 'progress'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Progress ({project.progressPercent}%)</span>
                </button>

                {/* 4. Dates (Delivery, install start, estimated completion only if enabled) */}
                <button
                  onClick={() => setActiveSection('dates')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    activeSection === 'dates'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Key Dates</span>
                </button>

                {/* 5. Documents (Accepted quote + shared files) */}
                {vis.documents && (
                  <button
                    onClick={() => setActiveSection('documents')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                      activeSection === 'documents'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Documents</span>
                  </button>
                )}

                {/* Audit Trail */}
                <button
                  onClick={() => setActiveSection('audit')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    activeSection === 'audit'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Audit Trail</span>
                </button>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* SECTION 1: FINANCIALS (Running total + invoices against total) */}
              {/* ------------------------------------------------------------- */}
              {activeSection === 'financials' && (
                <div className="space-y-6">
                  {/* Position Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Agreed Contract Total
                      </span>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 mt-1">
                        {formatNZD(agreedContractTotal)}
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Locked from Quote {project.currentAcceptedQuoteId || 'Accepted Version'}
                      </span>
                    </div>

                    <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Total Invoiced to Date
                      </span>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-sky-900 mt-1">
                        {formatNZD(totalInvoiced)}
                      </div>
                      <span className="text-[11px] text-sky-700 mt-0.5 block font-semibold">
                        {agreedContractTotal > 0 ? `${Math.round((totalInvoiced / agreedContractTotal) * 100)}% of contract claimed` : '0%'}
                      </span>
                    </div>

                    <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Paid to Date
                      </span>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-800 mt-1">
                        {formatNZD(totalPaid)}
                      </div>
                      <span className="text-[11px] text-emerald-700 mt-0.5 block font-semibold">
                        Confirmed bank receipts
                      </span>
                    </div>

                    <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Balance Remaining
                      </span>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 mt-1">
                        {formatNZD(balanceRemaining)}
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Retained until milestone stages
                      </span>
                    </div>
                  </div>

                  {/* Invoices List with Attached Progress Notes */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          Progress Claims &amp; Tax Invoices
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Progress claims against your agreed contract total, each accompanied by verified site progress notes.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {projectInvoices.length > 0 ? (
                        projectInvoices.map((inv: ProjectInvoice) => {
                          const isPaid = inv.status === 'paid';
                          return (
                            <div
                              key={inv.id}
                              className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <span className="font-mono font-bold text-slate-900 text-sm bg-white px-2.5 py-1 rounded-md border border-slate-200">
                                    {inv.invoiceNumber}
                                  </span>
                                  <span className="font-bold text-slate-800 text-xs">{inv.claimStage}</span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                                    isPaid
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}>
                                    {isPaid ? 'Paid' : 'Payment Due'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-4 text-xs font-mono">
                                  <div className="text-right">
                                    <span className="text-base font-bold text-slate-900 block">{formatNZD(inv.totalNZD)}</span>
                                    <span className="text-[10px] text-slate-400">
                                      Due: {formatDate(inv.dueDate)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Progress notes attached to claim */}
                              {inv.progressNotes && (
                                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700">
                                  <span className="font-bold text-slate-900 block mb-0.5 text-[11px]">
                                    Verified Site Progress Note Attached to Claim:
                                  </span>
                                  <p>{inv.progressNotes}</p>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                          No progress invoices issued yet. Claims are raised as site milestones are reached.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SECTION 2: QUOTES (Full version history with status & dates)  */}
              {/* ------------------------------------------------------------- */}
              {activeSection === 'quotes' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-2xs">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Quote Version History &amp; Immutability Record
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Full version history for this project. Quotes are versioned and immutable. Any changes created a new dated version with a 30-day validity window.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {projectQuotes.map((q) => {
                      const isCurrent = q.id === activeQuote?.id;
                      const isAcc = q.status === 'accepted';
                      const isSup = q.status === 'superseded';
                      const isExp = q.status === 'expired' || isQuoteExpired(q);

                      return (
                        <div
                          key={q.id}
                          className={`p-5 rounded-xl border transition-all ${
                            isAcc
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : isSup
                              ? 'bg-slate-50 border-slate-200'
                              : isExp
                              ? 'bg-rose-50/40 border-rose-200'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 text-sm">
                                  {q.quoteNumber}
                                </span>
                                <span className="font-mono text-xs text-slate-500">
                                  (Version {q.version || 1}.0)
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                                  isAcc
                                    ? 'bg-emerald-200 text-emerald-900'
                                    : isSup
                                    ? 'bg-slate-200 text-slate-700'
                                    : isExp
                                    ? 'bg-rose-200 text-rose-900'
                                    : 'bg-amber-200 text-amber-900'
                                }`}>
                                  {isAcc ? 'Accepted & Locked' : isSup ? 'Superseded' : isExp ? 'Expired' : 'Current'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600">
                                {q.title || project.title || 'Architectural Specification'} · {q.profile} · {q.material} ({q.colorName})
                              </p>
                              {isSup && q.supersededReason && (
                                <p className="text-[11px] text-slate-500 italic">
                                  Superseded on {q.supersededAt || 'site'}: {q.supersededReason}
                                </p>
                              )}
                              {isAcc && q.acceptedBy && (
                                <p className="text-[11px] text-emerald-800 font-medium">
                                  ✓ Accepted by {q.acceptedBy?.name || q.clientSignature || 'Client'} on {formatDate(q.signedAt || q.issueDate || '')}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col sm:items-end gap-2 shrink-0">
                              <div className="text-right font-mono">
                                <span className="text-lg font-bold text-slate-900">
                                  {formatNZD(q.totalNZD)}
                                </span>
                                <span className="text-[10px] text-slate-400 block">
                                  Issued: {formatDate(q.issueDate || '')} · Valid 30 days
                                </span>
                              </div>

                              <button
                                onClick={() => {
                                  setSelectedQuoteId(q.id);
                                  setViewQuoteMode(true);
                                }}
                                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View Proposal</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SECTION 3: PROGRESS (Approved notes and photos only)          */}
              {/* ------------------------------------------------------------- */}
              {activeSection === 'progress' && (
                <div className="space-y-6">
                  {/* Progress Status Bar */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Verified Project Completion
                        </span>
                        <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                          {project.progressPercent}% Completed
                        </h3>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-800 border border-sky-100 uppercase tracking-wide font-mono">
                        {project.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-slate-900 h-full rounded-full transition-all duration-500"
                        style={{ width: `${project.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Approved Progress Notes */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Approved Site Progress Notes</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          All updates shown here have undergone Project Manager review before publishing.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {approvedProgressNotes.length > 0 ? (
                        approvedProgressNotes.map(note => (
                          <div key={note.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-900">{note.title}</span>
                              <span className="font-mono text-slate-500">{formatDate(note.date)}</span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">{note.note}</p>
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Verified &amp; Published by {note.author}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                          Site staff updates are currently in review by the Project Manager. Approved updates will appear here.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Approved Photos (If photos toggle enabled) */}
                  {vis.photos && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Camera className="w-4 h-4 text-slate-700" />
                            <span>Approved Site Photos</span>
                          </h3>
                          <p className="text-xs text-slate-500">Live photography approved by supervisor for client inspection.</p>
                        </div>
                        <span className="text-xs font-mono text-slate-500">{approvedPhotos.length} photos</span>
                      </div>

                      {approvedPhotos.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          {approvedPhotos.map((photo) => (
                            <div key={photo.id} className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                              <div className="aspect-video bg-slate-200 overflow-hidden">
                                <img
                                  src={photo.url}
                                  alt={photo.caption}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                              <div className="p-3">
                                <p className="text-xs font-medium text-slate-900">{photo.caption}</p>
                                <span className="text-[11px] font-mono text-slate-500 mt-1 block">
                                  {formatDate(photo.takenAt)} · {photo.phase}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                          Site progress photos are currently undergoing internal quality review.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SECTION 4: DATES (Delivery, install, estimated completion)    */}
              {/* ------------------------------------------------------------- */}
              {activeSection === 'dates' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-2xs">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-700" />
                      <span>Project Dates &amp; Milestone Schedule</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Confirmed project milestones. Sensitive completion dates are subject to project coordinator scheduling.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    {/* Delivery Date */}
                    {vis.deliveryDate && (
                      <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          Tray &amp; Coil Delivery Window
                        </span>
                        <div className="text-base font-mono font-bold text-slate-900">
                          {project.deliveryDate ? formatDate(project.deliveryDate) : 'Window being scheduled'}
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          HIAB crane delivery direct to site staging
                        </span>
                      </div>
                    )}

                    {/* Install Start Date */}
                    {vis.installStartDate && (
                      <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          Installation Start Date
                        </span>
                        <div className="text-base font-mono font-bold text-slate-900">
                          {project.installStartDate || project.startDate ? formatDate(project.installStartDate || project.startDate) : 'To be confirmed'}
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          Following certified substrate sign-off
                        </span>
                      </div>
                    )}

                    {/* Estimated Completion Date: STRICT SENSITIVE TOGGLE */}
                    {vis.estimatedCompletionDate === true ? (
                      <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1">
                        <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">
                          Estimated Practical Completion
                        </span>
                        <div className="text-base font-mono font-bold text-emerald-950">
                          {formatDate(project.estimatedCompletionDate || project.targetCompletionDate)}
                        </div>
                        <span className="text-[11px] text-emerald-700 block">
                          ✓ Confirmed by Project Coordinator
                        </span>
                      </div>
                    ) : (
                      <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          Estimated Practical Completion
                        </span>
                        <div className="text-xs text-slate-600 font-medium leading-relaxed">
                          Scheduled in consultation with your project coordinator once substrate and weather windows are locked.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Milestones Checklist */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Installation Stage Milestones
                    </h4>

                    <div className="space-y-2.5">
                      {project.milestones.map((m, idx) => (
                        <div
                          key={m.id}
                          className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
                            m.completed ? 'bg-slate-50/70 border-slate-200' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="mt-0.5">
                            {m.completed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Circle className="w-4 h-4 text-slate-300" />
                            )}
                          </div>
                          <div className="flex-1">
                            <span className="font-bold text-slate-900">{m.title}</span>
                            {m.description && <p className="text-slate-600 mt-0.5">{m.description}</p>}
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {m.completed ? 'Completed' : 'Upcoming'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SECTION 5: DOCUMENTS (Accepted quote + shared files)          */}
              {/* ------------------------------------------------------------- */}
              {activeSection === 'documents' && vis.documents && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-2xs">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Download className="w-4 h-4 text-slate-700" />
                      <span>Shared Documents, Plans &amp; Warranties</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Your accepted contract reference and project compliance documentation.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                    {/* Primary Accepted Quote Document */}
                    {activeQuote && (
                      <div className="p-4 bg-slate-50/70 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                            <FileCheck className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">
                              Accepted Commercial Contract: {activeQuote.quoteNumber} (v{activeQuote.version || 1}.0)
                            </span>
                            <span className="text-slate-500 text-[11px]">
                              Locked commercial reference · {formatNZD(activeQuote.totalNZD)} · Signed {formatDate(activeQuote.signedAt || activeQuote.issueDate || '')}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => setViewQuoteMode(true)}
                          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 cursor-pointer"
                        >
                          View Document
                        </button>
                      </div>
                    )}

                    {/* Shared Client Files */}
                    {(project.clientDocuments || []).filter(d => d.sharedWithClient).map(doc => (
                      <div key={doc.id} className="p-4 bg-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{doc.name}</span>
                            <span className="text-slate-500 text-[11px]">
                              {doc.category} · Uploaded {formatDate(doc.uploadedAt)}
                            </span>
                          </div>
                        </div>

                        <a
                          href={doc.fileUrl || '#'}
                          className="px-3 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-colors"
                        >
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SECTION 6: AUDIT TRAIL                                        */}
              {/* ------------------------------------------------------------- */}
              {activeSection === 'audit' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xs">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Commercial &amp; Approval Audit Trail</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Immutable record of quote acceptances, status transitions, and Project Manager progress approvals.
                    </p>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    {(activeQuote?.auditTrail || []).map(entry => (
                      <div key={entry.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
                        <div className="p-1.5 bg-white rounded-md border border-slate-200 text-slate-600 mt-0.5">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 capitalize">{entry.action.replace('_', ' ')}</span>
                            <span className="font-mono text-slate-400 text-[11px]">{formatDate(entry.timestamp)}</span>
                          </div>
                          <p className="text-slate-600">{entry.details}</p>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            Actor: {entry.actor} ({entry.actorType}) · Version {entry.versionNumber}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: ACCEPT & AUTHORIZE QUOTE                                   */}
      {/* ----------------------------------------------------------------- */}
      {isAcceptModalOpen && activeQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Authorize &amp; Lock Contract</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quote {activeQuote.quoteNumber} (Version {activeQuote.version || 1}.0)
                </p>
              </div>
              <button
                onClick={() => setIsAcceptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAcceptQuote} className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-500 font-medium">Agreed Commercial Investment:</span>
                <div className="text-xl font-bold font-mono text-slate-900">
                  {formatNZD(activeQuote.totalNZD)} <span className="text-xs font-normal text-slate-500">(incl. 15% GST)</span>
                </div>
                <p className="text-[11px] text-slate-500 pt-1">
                  Upon authorization, this price and version are permanently locked. Your full Archtech Client Portal account is activated immediately.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Authorizing Client / Representative Name:</label>
                  <input
                    type="text"
                    required
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    placeholder="e.g. Julian Vance"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Confirmation Email Address:</label>
                  <input
                    type="email"
                    required
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    placeholder="e.g. julian.vance@nzvance.co.nz"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={termsAgreed}
                    onChange={(e) => setTermsAgreed(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-slate-600 leading-snug">
                    I confirm authorization of Quote {activeQuote.quoteNumber} in accordance with Archtech Terms of Trade and MRM Code of Practice standards.
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAcceptModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm &amp; Lock Contract</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: DECLINE QUOTE                                              */}
      {/* ----------------------------------------------------------------- */}
      {isDeclineModalOpen && activeQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Decline Proposal</h3>
            <p className="text-xs text-slate-500">
              Please share any specific feedback so our estimating team can adjust specifications or clarify details.
            </p>

            <form onSubmit={handleConfirmDeclineQuote} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason / Feedback (Optional):</label>
                <textarea
                  rows={3}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g. Budget adjustment required, project postponed, alternative profile sought..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDeclineModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold shadow-xs cursor-pointer"
                >
                  Confirm Decline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: REQUEST CURRENT PRICING (EXPIRED QUOTE ACTION)             */}
      {/* ----------------------------------------------------------------- */}
      {isRequestPricingModalOpen && activeQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-bold">Request Current Price Matrix Rates</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Because Quote {activeQuote.quoteNumber} has passed its 30-day validity window, rates will be re-looked up from the current price matrix. Quantities remain identical and a new dated version will be generated.
            </p>

            <form onSubmit={handleRequestPricing} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Optional Notes for Estimator:</label>
                <textarea
                  rows={3}
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g. Ready to proceed once pricing is refreshed to current coil rates..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRequestPricingModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Price Refresh Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: REQUEST SCOPE AMENDMENT                                    */}
      {/* ----------------------------------------------------------------- */}
      {isRequestAmendmentModalOpen && activeQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Request Scope Amendment</h3>
            <p className="text-xs text-slate-500">
              Request a material, profile, pan size, or quantity amendment. Archtech will recalculate and issue a new dated version.
            </p>

            <form onSubmit={handleRequestAmendment} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Requested Amendments:</label>
                <textarea
                  rows={4}
                  required
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g. Please update profile from Super Seam to Angle Seam, or switch material to VitorZX Extreme Coastal..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRequestAmendmentModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-xs cursor-pointer"
                >
                  Send Amendment Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
