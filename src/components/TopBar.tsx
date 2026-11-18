import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  ChevronDown, 
  FolderKanban,
  Calculator,
  UserCheck,
  X,
  ShieldCheck,
  HardHat,
  FileText,
  ExternalLink,
  Check,
  Sparkles,
  Compass,
  Menu
} from 'lucide-react';
import { Project, Quote, Lead } from '../types/crm';
import { formatNZD } from '../utils/formatters';
import { NavTab } from './Sidebar';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  projects: Project[];
  quotes: Quote[];
  leads: Lead[];
  isClientPortalMode: boolean;
  setIsClientPortalMode: (portal: boolean) => void;
  onSelectProject: (projectId: string) => void;
  onSelectQuote: (quoteId: string) => void;
  onQuickNewJob: () => void;
  onQuickNewQuote: () => void;
  onQuickNewLead: () => void;
  onOpenOneDrive?: () => void;
  onOpenSiteApprovals?: () => void;
  onSwitchPersona?: (role: 'pm' | 'site_staff' | 'client_pre' | 'client_active') => void;
  onOpenMobileMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  projects,
  quotes,
  leads,
  isClientPortalMode,
  setIsClientPortalMode,
  onSelectProject,
  onSelectQuote,
  onQuickNewJob,
  onQuickNewQuote,
  onQuickNewLead,
  onOpenSiteApprovals,
  onSwitchPersona,
  onOpenMobileMenu
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [isPersonaMenuOpen, setIsPersonaMenuOpen] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quickActionRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
      if (quickActionRef.current && !quickActionRef.current.contains(e.target as Node)) {
        setIsQuickActionOpen(false);
      }
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) {
        setIsPersonaMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcut to focus search (⌘K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Omni Search Results
  const matchingProjects = searchQuery.trim() 
    ? projects.filter(p => 
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.projectNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.siteAddress.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 4)
    : [];

  const matchingQuotes = searchQuery.trim() 
    ? quotes.filter(q =>
        q.quoteNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.siteAddress.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 3)
    : [];

  const matchingLeads = searchQuery.trim() 
    ? leads.filter(l =>
        l.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.companyOrArchitect && l.companyOrArchitect.toLowerCase().includes(searchQuery.toLowerCase())) ||
        l.projectAddress.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 3)
    : [];

  const hasResults = matchingProjects.length > 0 || matchingQuotes.length > 0 || matchingLeads.length > 0;

  // Pending approvals count
  const siteApprovalsPendingCount = projects.reduce((acc, p) => 
    acc + (p.siteUpdateSubmissions || []).filter(s => s.approvalStatus === 'pending').length, 0
  );

  // Tab Breadcrumb text
  const getBreadcrumbTitle = () => {
    if (isClientPortalMode) return 'Client Portal · Interactive Review';
    switch (activeTab) {
      case 'status_board': return 'Dashboard';
      case 'leads': return 'Leads & Enquiries';
      case 'projects': return 'Jobs & Projects';
      case 'quotes': return 'Quotes & Pricing';
      case 'approvals': return 'Approval Queue';
      case 'exact_roofing': return 'ApexMap™ Studio · Exact Roofing & Flashings';
      case 'schedule': return 'Crew Schedule';
      case 'site_visit': return 'ApexMap™ Onsite';
      case 'flashing_library': return 'Flashing Workshop';
      case 'flashing_orders': return 'Flashing Orders';
      case 'inventory': return 'Inventory & Coils';
      case 'catalogue': return 'Price Book';
      case 'automations': return 'Email Automations';
      default: return 'Archtech Roofing';
    }
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-20">
      {/* Left: Mobile Drawer Toggle + Clean Breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 -ml-1 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
            aria-label="Open Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium min-w-0">
          <span className="hidden sm:inline">Archtech</span>
          <span className="hidden sm:inline text-slate-300">/</span>
          <span className="text-sm font-bold text-slate-900 truncate">
            {getBreadcrumbTitle()}
          </span>
        </div>
      </div>

      {/* Center: Global Omni-Search */}
      <div ref={searchRef} className="relative flex-1 max-w-md hidden sm:block">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search jobs, quotes, architects, addresses..."
            value={searchQuery}
            onFocus={() => setIsSearchOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            className="w-full pl-9 pr-14 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded">
                ⌘K
              </kbd>
            )}
          </div>
        </div>

        {/* Search Results Dropdown */}
        {isSearchOpen && searchQuery.trim() && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden z-50 text-xs divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {hasResults ? (
              <>
                {matchingProjects.length > 0 && (
                  <div className="p-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1">Jobs & Projects</span>
                    {matchingProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onSelectProject(p.id);
                          setIsClientPortalMode(false);
                          setActiveTab('projects');
                          setIsSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full text-left p-2 rounded-md hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-slate-900 block truncate">{p.title}</span>
                          <span className="text-slate-500 text-[11px] truncate block">{p.projectNumber} · {p.clientName} · {p.siteAddress}</span>
                        </div>
                        <span className="font-mono font-semibold text-slate-700 text-xs shrink-0 tabular-nums">
                          {formatNZD(p.contractValueNZD)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {matchingQuotes.length > 0 && (
                  <div className="p-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1">Quotes</span>
                    {matchingQuotes.map(q => (
                      <button
                        key={q.id}
                        onClick={() => {
                          onSelectQuote(q.id);
                          setIsClientPortalMode(false);
                          setActiveTab('quotes');
                          setIsSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full text-left p-2 rounded-md hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-slate-900 block truncate">{q.quoteNumber} — {q.clientName}</span>
                          <span className="text-slate-500 text-[11px] truncate block">{q.siteAddress}</span>
                        </div>
                        <span className="font-mono font-semibold text-sky-700 text-xs shrink-0 tabular-nums">
                          {formatNZD(q.totalNZD)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {matchingLeads.length > 0 && (
                  <div className="p-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1">Leads & Enquiries</span>
                    {matchingLeads.map(l => (
                      <button
                        key={l.id}
                        onClick={() => {
                          setIsClientPortalMode(false);
                          setActiveTab('leads');
                          setIsSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full text-left p-2 rounded-md hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-slate-900 block truncate">{l.clientName}</span>
                          <span className="text-slate-500 text-[11px] truncate block">{l.companyOrArchitect} · {l.projectAddress}</span>
                        </div>
                        <span className="font-mono font-medium text-slate-700 text-xs shrink-0 tabular-nums">
                          {formatNZD(l.estimatedValueNZD)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 text-center text-slate-400">
                No matching jobs, quotes, or leads found for "{searchQuery}".
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Calm Action Zone */}
      <div className="flex items-center gap-2 shrink-0">
        <PWAInstallButton compact darkTheme={false} />

        {/* Site Approvals Badge Button */}
        {siteApprovalsPendingCount > 0 && (
          <button
            onClick={() => {
              if (onOpenSiteApprovals) {
                onOpenSiteApprovals();
              } else {
                setActiveTab('approvals');
              }
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors cursor-pointer"
            title="Site progress submissions waiting for your review and approval"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="hidden md:inline">Approvals</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-500 text-white tabular-nums">
              {siteApprovalsPendingCount}
            </span>
          </button>
        )}

        {/* Smart AI Assist Button */}
        <button
          onClick={() => {
            setIsClientPortalMode(false);
            setActiveTab('quotes');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-700 hover:to-purple-700 transition-all cursor-pointer shadow-2xs"
          title="Open Smart Scope Takeoff & NZBC Code Auditor"
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-200 animate-pulse" />
          <span className="hidden sm:inline">Smart AI Assist</span>
        </button>

        {/* Primary Action: + New Button */}
        <div ref={quickActionRef} className="relative">
          <button
            onClick={() => setIsQuickActionOpen(!isQuickActionOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isQuickActionOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-50 text-xs divide-y divide-slate-100">
              <div className="py-0.5">
                <button
                  onClick={() => {
                    setIsClientPortalMode(false);
                    setActiveTab('exact_roofing');
                    setIsQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 text-blue-950 cursor-pointer font-bold border-b border-slate-100"
                >
                  <Compass className="w-4 h-4 text-blue-600" />
                  <span>ApexMap™ Roof &amp; Flashings</span>
                </button>
                <button
                  onClick={() => {
                    setIsClientPortalMode(false);
                    setActiveTab('quotes');
                    setIsQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-sky-50 flex items-center gap-2 text-sky-950 cursor-pointer font-medium"
                >
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  <span>Smart Scope AI Takeoff</span>
                </button>
                <button
                  onClick={() => {
                    onQuickNewJob();
                    setIsQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer font-medium"
                >
                  <FolderKanban className="w-4 h-4 text-sky-600" />
                  <span>New Trade Job</span>
                </button>
                <button
                  onClick={() => {
                    onQuickNewLead();
                    setIsQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer font-medium"
                >
                  <UserCheck className="w-4 h-4 text-amber-600" />
                  <span>New Lead / Enquiry</span>
                </button>
                <button
                  onClick={() => {
                    onQuickNewQuote();
                    setIsQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer font-medium"
                >
                  <Calculator className="w-4 h-4 text-purple-600" />
                  <span>New Quote Takeoff</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Role & Client View Switcher */}
        <div ref={personaRef} className="relative">
          <button
            onClick={() => setIsPersonaMenuOpen(!isPersonaMenuOpen)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 transition-colors cursor-pointer"
            title="Switch workspace role view"
          >
            <span>{isClientPortalMode ? 'Client View' : 'Manager View'}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isPersonaMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-lg border border-slate-200 shadow-lg py-1.5 z-50 text-xs divide-y divide-slate-100">
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Workspace View
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    setIsPersonaMenuOpen(false);
                    setIsClientPortalMode(false);
                    onSwitchPersona?.('pm');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between text-slate-800 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span className="font-semibold text-slate-900">Project Manager</span>
                  </div>
                  {!isClientPortalMode && <Check className="w-3.5 h-3.5 text-sky-600" />}
                </button>
                <button
                  onClick={() => {
                    setIsPersonaMenuOpen(false);
                    setIsClientPortalMode(false);
                    setActiveTab('site_visit');
                    onSwitchPersona?.('site_staff');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer"
                >
                  <HardHat className="w-3.5 h-3.5 text-slate-500" />
                  <span>Site Crew (ApexMap™)</span>
                </button>
                <button
                  onClick={() => {
                    setIsPersonaMenuOpen(false);
                    setIsClientPortalMode(true);
                    onSwitchPersona?.('client_active');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between text-slate-800 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5 text-purple-600" />
                    <span className="font-semibold text-purple-900">Client Portal</span>
                  </div>
                  {isClientPortalMode && <Check className="w-3.5 h-3.5 text-purple-600" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
