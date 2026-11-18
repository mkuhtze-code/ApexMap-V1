/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Lead, 
  Project, 
  CoilStock, 
  AccessoryStock, 
  Quote, 
  EmailAutomationRule, 
  OutboxEmail,
  SiteVisitInspection,
  MasterPricingCatalogue,
  TimeEntry,
  ActivityLogItem,
  TeamMember 
} from './types/crm';
import { 
  INITIAL_LEADS, 
  INITIAL_PROJECTS, 
  INITIAL_COIL_STOCK, 
  INITIAL_ACCESSORY_STOCK, 
  INITIAL_QUOTES, 
  INITIAL_EMAIL_RULES, 
  INITIAL_OUTBOX, 
  INITIAL_SITE_INSPECTIONS,
  INITIAL_TEAM_MEMBERS 
} from './data/initialData';
import { INITIAL_PRICING_CATALOGUE } from './data/pricingCatalogue';
import { Sidebar, NavTab } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { JobStatusBoard } from './components/JobStatusBoard';
import { LeadPipeline } from './components/LeadPipeline';
import { ProjectProgress } from './components/ProjectProgress';
import { InventoryManager } from './components/InventoryManager';
import { QuoteBuilder } from './components/QuoteBuilder';
import { PricingCatalogueManager } from './components/PricingCatalogueManager';
import { EmailAutomations } from './components/EmailAutomations';
import { ClientPortal } from './components/ClientPortal';
import { OnsiteJobHub } from './components/OnsiteJobHub';
import { ScheduleCalendar } from './components/ScheduleCalendar';
import { LogTimeModal } from './components/LogTimeModal';
import { NewJobModal } from './components/NewJobModal';
import { OneDriveSyncModal } from './components/OneDriveSyncModal';
import { FlashingWorkshop } from './components/FlashingWorkshop';
import { SiteApprovalQueueModal } from './components/SiteApprovalQueueModal';
import { ApprovalQueueView } from './components/ApprovalQueueView';
import { SmartCommandPalette } from './components/SmartCommandPalette';
import { ExactRoofingHub } from './components/exactroofing/ExactRoofingHub';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useDeviceDetection } from './hooks/useDeviceDetection';
import { applyBomToQuoteObject } from './utils/exactRoofingBomBridge';
import { RoofBomSummary, ExactRoofModelSnapshot } from './types/exactRoofing';
import { RoofingProfile, CoilMaterial } from './types/crm';

export default function App() {
  const { isMobile } = useDeviceDetection();
  // State with LocalStorage persistence
  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('archtech_leads');
    return saved ? JSON.parse(saved) : INITIAL_LEADS;
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('archtech_projects');
    return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
  });

  const [coils, setCoils] = useState<CoilStock[]>(() => {
    const saved = localStorage.getItem('archtech_coils');
    return saved ? JSON.parse(saved) : INITIAL_COIL_STOCK;
  });

  const [accessories, setAccessories] = useState<AccessoryStock[]>(() => {
    const saved = localStorage.getItem('archtech_accessories');
    return saved ? JSON.parse(saved) : INITIAL_ACCESSORY_STOCK;
  });

  const [quotes, setQuotes] = useState<Quote[]>(() => {
    const saved = localStorage.getItem('archtech_quotes');
    return saved ? JSON.parse(saved) : INITIAL_QUOTES;
  });

  const [emailRules, setEmailRules] = useState<EmailAutomationRule[]>(() => {
    const saved = localStorage.getItem('archtech_email_rules');
    return saved ? JSON.parse(saved) : INITIAL_EMAIL_RULES;
  });

  const [outbox, setOutbox] = useState<OutboxEmail[]>(() => {
    const saved = localStorage.getItem('archtech_outbox');
    return saved ? JSON.parse(saved) : INITIAL_OUTBOX;
  });

  const [inspections, setInspections] = useState<SiteVisitInspection[]>(() => {
    const saved = localStorage.getItem('archtech_inspections');
    return saved ? JSON.parse(saved) : INITIAL_SITE_INSPECTIONS;
  });

  const [catalogue, setCatalogue] = useState<MasterPricingCatalogue>(() => {
    const saved = localStorage.getItem('archtech_pricing_catalogue');
    return saved ? JSON.parse(saved) : INITIAL_PRICING_CATALOGUE;
  });

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    const saved = localStorage.getItem('archtech_team_members');
    return saved ? JSON.parse(saved) : INITIAL_TEAM_MEMBERS;
  });

  // App Layout & Navigation state
  const [activeTab, setActiveTab] = useState<NavTab>('status_board');
  const [isClientPortalMode, setIsClientPortalMode] = useState<boolean>(false);
  const [activePortalProjectId, setActivePortalProjectId] = useState<string>(projects[0]?.id || '');
  const [activePortalQuoteId, setActivePortalQuoteId] = useState<string | undefined>(undefined);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [prefillQuoteLead, setPrefillQuoteLead] = useState<Lead | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Deep linking via URL parameters (e.g. ?quoteId=... or ?tab=exact_roofing)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const qId = urlParams.get('quoteId');
      const pId = urlParams.get('projectId') || urlParams.get('portalProject');
      const tabParam = urlParams.get('tab');
      if (qId) {
        setActivePortalQuoteId(qId);
        const targetQ = quotes.find(q => q.id === qId);
        if (targetQ?.projectId) {
          setActivePortalProjectId(targetQ.projectId);
        }
        setIsClientPortalMode(true);
      } else if (pId) {
        setActivePortalProjectId(pId);
        setIsClientPortalMode(true);
      } else if (tabParam === 'exact_roofing') {
        setActiveTab('exact_roofing');
      } else if (tabParam === 'flashing_orders' || tabParam === 'flashing_library') {
        setActiveTab(tabParam);
      }
    } catch {
      // ignore
    }
  }, []);

  // Dynamically sync Web App Manifest when viewing Exact Roofing Engine
  useEffect(() => {
    const manifestEl = document.getElementById('app-manifest');
    if (!manifestEl) return;
    const cleanPath = window.location.pathname.replace(/\/+$/, '');
    if (
      activeTab === 'exact_roofing' ||
      ['/roof', '/exact-roofing'].includes(cleanPath)
    ) {
      manifestEl.setAttribute('href', '/manifest-roofing.webmanifest');
    } else if (['/site', '/field'].includes(cleanPath)) {
      manifestEl.setAttribute('href', '/manifest-site.webmanifest');
    } else {
      manifestEl.setAttribute('href', '/manifest.webmanifest');
    }
  }, [activeTab]);

  // Modals state
  const [isLogTimeModalOpen, setIsLogTimeModalOpen] = useState<boolean>(false);
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState<boolean>(false);
  const [isOneDriveModalOpen, setIsOneDriveModalOpen] = useState<boolean>(false);
  const [isSiteApprovalsModalOpen, setIsSiteApprovalsModalOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Global Keyboard listener for Command Palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('archtech_leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('archtech_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('archtech_coils', JSON.stringify(coils));
  }, [coils]);

  useEffect(() => {
    localStorage.setItem('archtech_accessories', JSON.stringify(accessories));
  }, [accessories]);

  useEffect(() => {
    localStorage.setItem('archtech_quotes', JSON.stringify(quotes));
  }, [quotes]);

  useEffect(() => {
    localStorage.setItem('archtech_pricing_catalogue', JSON.stringify(catalogue));
  }, [catalogue]);

  useEffect(() => {
    localStorage.setItem('archtech_email_rules', JSON.stringify(emailRules));
  }, [emailRules]);

  useEffect(() => {
    localStorage.setItem('archtech_outbox', JSON.stringify(outbox));
  }, [outbox]);

  useEffect(() => {
    localStorage.setItem('archtech_inspections', JSON.stringify(inspections));
  }, [inspections]);

  useEffect(() => {
    localStorage.setItem('archtech_team_members', JSON.stringify(teamMembers));
  }, [teamMembers]);

  // Lead Handlers
  const handleUpdateLead = (updated: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleAddLead = (newLead: Lead) => {
    setLeads((prev) => [newLead, ...prev]);
  };

  const handleCreateQuoteFromLead = (lead: Lead) => {
    setPrefillQuoteLead(lead);
    setActiveTab('quotes');
  };

  // Project Handlers
  const handleUpdateProject = (updated: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleAddProject = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
    setSelectedProjectId(newProject.id);
  };

  const handleOpenClientPortal = (projectId: string) => {
    setActivePortalProjectId(projectId);
    setActivePortalQuoteId(undefined);
    setIsClientPortalMode(true);
  };

  const handleOpenQuoteInPortal = (quoteId: string, projectId?: string) => {
    setActivePortalQuoteId(quoteId);
    if (projectId) {
      setActivePortalProjectId(projectId);
    } else {
      const q = quotes.find(item => item.id === quoteId);
      if (q?.projectId) setActivePortalProjectId(q.projectId);
    }
    setIsClientPortalMode(true);
  };

  const handleOpenProjectDetails = (projectId: string) => {
    setSelectedProjectId(projectId);
    setIsClientPortalMode(false);
    setActiveTab('projects');
  };

  const handleSwitchPersona = (role: 'pm' | 'site_staff' | 'client_pre' | 'client_active') => {
    if (role === 'pm') {
      setIsClientPortalMode(false);
    } else if (role === 'site_staff') {
      setIsClientPortalMode(false);
      setActiveTab('site_visit');
    } else if (role === 'client_pre') {
      setIsClientPortalMode(true);
      const preQuote = quotes.find(q => q.status === 'sent' || q.status === 'expired') || quotes[1] || quotes[0];
      if (preQuote) {
        setActivePortalQuoteId(preQuote.id);
        if (preQuote.projectId) setActivePortalProjectId(preQuote.projectId);
      }
    } else if (role === 'client_active') {
      setIsClientPortalMode(true);
      setActivePortalQuoteId(undefined);
      setActivePortalProjectId(projects[0]?.id || '');
    }
  };

  const handleSaveTimeEntry = (entry: TimeEntry) => {
    const targetProject = projects.find((p) => p.id === entry.projectId);
    if (!targetProject) return;

    const activityItem: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: targetProject.id,
      entityType: 'project',
      type: 'time_logged',
      title: `Logged ${entry.hours} hrs: ${entry.taskType}`,
      details: `${entry.foreman} recorded ${entry.hours} hrs on site. Notes: ${entry.notes || 'Routine task execution'}.`,
      author: entry.foreman,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    const updatedProject: Project = {
      ...targetProject,
      timeEntries: [entry, ...(targetProject.timeEntries || [])],
      activityFeed: [activityItem, ...(targetProject.activityFeed || [])]
    };

    handleUpdateProject(updatedProject);
  };

  // Inventory Handlers
  const handleUpdateCoil = (updated: CoilStock) => {
    setCoils((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleAddCoil = (newCoil: CoilStock) => {
    setCoils((prev) => [newCoil, ...prev]);
  };

  const handleUpdateAccessory = (updated: AccessoryStock) => {
    setAccessories((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  // Quote Handlers
  const handleUpdateQuote = (updated: Quote) => {
    setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
  };

  const handleAddQuote = (newQuote: Quote) => {
    setQuotes((prev) => [newQuote, ...prev]);
  };

  const handlePushBomToQuoteFromStudio = (opts: {
    targetQuoteId: string | 'new';
    profile: RoofingProfile;
    material: CoilMaterial;
    colorName: string;
    markupPercent: number;
    includeHardware: boolean;
    includeUnderlay: boolean;
    includeLabourEstimate: boolean;
    replaceExistingSections: boolean;
    bom: RoofBomSummary;
    snapshot: ExactRoofModelSnapshot;
    project?: Project;
  }) => {
    const targetProject = opts.project || projects.find((p) => p.id === selectedProjectId) || projects[0];
    if (opts.targetQuoteId === 'new') {
      const baseTemplate = quotes[0] || ({} as Quote);
      const baseQuote: Quote = {
        ...baseTemplate,
        id: `q-${Date.now()}`,
        quoteNumber: `QT-${Math.floor(1000 + Math.random() * 9000)}`,
        projectId: targetProject?.id,
        clientName: targetProject?.clientName || 'New Roofing Client',
        clientEmail: '',
        clientPhone: '',
        siteAddress: targetProject?.siteAddress || 'Auckland Site',
        notes: `ApexMap Studio BOM Quote (${opts.bom.totalRoofAreaM2}m² · ${opts.bom.totalSheetsCount} sheets)`,
        profile: opts.profile,
        material: opts.material,
        colorName: opts.colorName,
        roofAreaM2: opts.bom.totalRoofAreaM2,
        markupPercent: opts.markupPercent,
        status: 'draft',
        version: 1,
        createdAt: new Date().toISOString().split('T')[0],
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        spreadsheetSections: [],
        spreadsheetRows: [],
        quoteSections: [],
        quoteRows: []
      };

      const populated = applyBomToQuoteObject({
        quote: baseQuote,
        bom: opts.bom,
        snapshot: opts.snapshot,
        includeHardware: opts.includeHardware,
        includeUnderlay: opts.includeUnderlay,
        includeLabourEstimate: opts.includeLabourEstimate,
        replaceExistingSections: true
      });
      handleAddQuote(populated);
    } else {
      const existing = quotes.find((q) => q.id === opts.targetQuoteId) || quotes[0];
      if (existing) {
        const updated = applyBomToQuoteObject({
          quote: {
            ...existing,
            projectId: existing.projectId || targetProject?.id,
            profile: opts.profile,
            material: opts.material,
            colorName: opts.colorName,
            markupPercent: opts.markupPercent
          },
          bom: opts.bom,
          snapshot: opts.snapshot,
          includeHardware: opts.includeHardware,
          includeUnderlay: opts.includeUnderlay,
          includeLabourEstimate: opts.includeLabourEstimate,
          replaceExistingSections: opts.replaceExistingSections
        });
        handleUpdateQuote(updated);
      }
    }

    if (targetProject) {
      handleUpdateProject({
        ...targetProject,
        roofPlanModel: opts.snapshot as any,
        roofAreaM2: opts.bom.totalRoofAreaM2 || targetProject.roofAreaM2
      });
    }
    setActiveTab('quotes');
  };

  // Pricing Catalogue Handler
  const handleUpdateCatalogue = (updated: MasterPricingCatalogue) => {
    setCatalogue(updated);
  };

  // Email Automation Handlers
  const handleUpdateRule = (updated: EmailAutomationRule) => {
    setEmailRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleSendManualEmail = (email: OutboxEmail) => {
    setOutbox((prev) => [email, ...prev]);
  };

  // Site Inspection Handlers
  const handleAddInspection = (newInspection: SiteVisitInspection) => {
    setInspections((prev) => [newInspection, ...prev]);
  };

  const cleanRoutePath = window.location.pathname.replace(/\/+$/, '');
  const isFieldRoute = ['/site', '/field'].includes(cleanRoutePath);
  const isExactRoofingRoute = ['/roof', '/exact-roofing'].includes(cleanRoutePath);

  if (isFieldRoute) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-50 text-slate-900 font-sans antialiased overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
        <OnsiteJobHub projects={projects} onUpdateProject={handleUpdateProject} initialProjectId={selectedProjectId} teamMembers={teamMembers} onOpenAdvanced={() => { window.location.hash = '#more'; }} />
        <OfflineIndicator />
      </div>
    );
  }

  if (isExactRoofingRoute) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#070b14] text-white font-sans antialiased overflow-hidden">
        <ExactRoofingHub
          project={projects.find((p) => p.id === selectedProjectId) || projects[0]}
          projects={projects}
          quotes={quotes}
          activeQuote={quotes.find((q) => q.projectId === selectedProjectId) || quotes[0]}
          onSelectProject={setSelectedProjectId}
          activeMemberName={teamMembers[0]?.name || 'Archtech team'}
          onOpenMobileMenu={() => setIsMobileNavOpen(true)}
          onUpdateProject={handleUpdateProject}
          onPushBomToQuote={handlePushBomToQuoteFromStudio}
          onOpenFlashingOrders={() => {
            window.history.pushState({}, '', '/?tab=flashing_orders');
            setActiveTab('flashing_orders');
          }}
          onSaveToProject={(planes, layout, flashingAssignments, snapshot) => {
            const activeP = projects.find((p) => p.id === selectedProjectId) || projects[0];
            if (activeP) {
              const updatedP = {
                ...activeP,
                roofAreaM2: snapshot?.bom?.totalRoofAreaM2 || activeP.roofAreaM2,
                roofPlanModel: {
                  ...(activeP.roofPlanModel || {}),
                  ...(snapshot || {}),
                  planes,
                  layout,
                  flashingAssignments,
                  savedAt: new Date().toISOString()
                }
              };
              handleUpdateProject(updatedP as any);
            }
          }}
        />
        {isMobileNavOpen && (
          <div
            className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-xs flex animate-in fade-in"
            onClick={() => setIsMobileNavOpen(false)}
          >
            <div onClick={(e) => e.stopPropagation()} className="h-full flex">
              <Sidebar
                activeTab="exact_roofing"
                setActiveTab={(tab) => {
                  setIsMobileNavOpen(false);
                  window.history.pushState({}, '', `/?tab=${tab}`);
                  setActiveTab(tab);
                }}
                projects={projects}
                leads={leads}
                quotes={quotes}
                isCollapsed={false}
                setIsCollapsed={() => setIsMobileNavOpen(false)}
                isClientPortalMode={false}
                setIsClientPortalMode={(portal) => {
                  setIsMobileNavOpen(false);
                  setIsClientPortalMode(portal);
                }}
                onQuickNewJob={() => {
                  setIsMobileNavOpen(false);
                  setIsNewJobModalOpen(true);
                }}
              />
            </div>
          </div>
        )}
        <OfflineIndicator />
      </div>
    );
  }

  const isMobileFullscreenRoofing = isMobile && activeTab === 'exact_roofing' && !isClientPortalMode;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex font-sans antialiased overflow-x-hidden">
      {/* Desktop Persistent Sidebar */}
      {!isMobile && (
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          projects={projects}
          leads={leads}
          quotes={quotes}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          isClientPortalMode={isClientPortalMode}
          setIsClientPortalMode={setIsClientPortalMode}
          onQuickNewJob={() => setIsNewJobModalOpen(true)}
        />
      )}

      {/* Mobile Slide-Over Navigation Drawer */}
      {isMobile && isMobileNavOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-xs flex animate-in fade-in"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="h-full flex">
            <Sidebar
              activeTab={activeTab}
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setIsMobileNavOpen(false);
              }}
              projects={projects}
              leads={leads}
              quotes={quotes}
              isCollapsed={false}
              setIsCollapsed={() => setIsMobileNavOpen(false)}
              isClientPortalMode={isClientPortalMode}
              setIsClientPortalMode={(portal) => {
                setIsClientPortalMode(portal);
                setIsMobileNavOpen(false);
              }}
              onQuickNewJob={() => {
                setIsMobileNavOpen(false);
                setIsNewJobModalOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Navigation (Hidden when Exact Roofing Engine runs fullscreen on mobile) */}
        {!isMobileFullscreenRoofing && (
          <TopBar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            projects={projects}
            quotes={quotes}
            leads={leads}
            isClientPortalMode={isClientPortalMode}
            setIsClientPortalMode={setIsClientPortalMode}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              setActiveTab('projects');
            }}
            onSelectQuote={(id) => {
              setActiveTab('quotes');
            }}
            onQuickNewJob={() => setIsNewJobModalOpen(true)}
            onQuickNewQuote={() => {
              setIsClientPortalMode(false);
              setActiveTab('quotes');
            }}
            onQuickNewLead={() => {
              setIsClientPortalMode(false);
              setActiveTab('leads');
            }}
            onOpenOneDrive={() => setIsOneDriveModalOpen(true)}
            onOpenSiteApprovals={() => setIsSiteApprovalsModalOpen(true)}
            onSwitchPersona={handleSwitchPersona}
            onOpenMobileMenu={() => setIsMobileNavOpen(true)}
          />
        )}

        {/* Viewport Content Canvas */}
        <main
          className={
            isMobileFullscreenRoofing
              ? 'flex-1 w-full p-0 overflow-hidden'
              : 'flex-1 p-3 sm:p-6 lg:p-7 max-w-[1700px] w-full mx-auto'
          }
        >
          {isClientPortalMode ? (
            <ClientPortal
              projects={projects}
              activeProjectId={activePortalProjectId}
              quotes={quotes}
              activeQuoteId={activePortalQuoteId}
              catalogue={catalogue}
              onUpdateProject={handleUpdateProject}
              onUpdateQuote={handleUpdateQuote}
              onAddQuote={handleAddQuote}
              onReturnToStaff={() => setIsClientPortalMode(false)}
            />
          ) : (
            <>
              {activeTab === 'status_board' && (
                <JobStatusBoard
                  projects={projects}
                  onUpdateProject={handleUpdateProject}
                  onOpenProjectDetails={handleOpenProjectDetails}
                  onAddNewProject={() => setIsNewJobModalOpen(true)}
                />
              )}
              {activeTab === 'exact_roofing' && (
                <ExactRoofingHub
                  project={projects.find((p) => p.id === selectedProjectId) || projects[0]}
                  projects={projects}
                  quotes={quotes}
                  activeQuote={quotes.find((q) => q.projectId === selectedProjectId) || quotes[0]}
                  onSelectProject={setSelectedProjectId}
                  activeMemberName={teamMembers[0]?.name || 'Archtech team'}
                  onOpenMobileMenu={() => setIsMobileNavOpen(true)}
                  onUpdateProject={handleUpdateProject}
                  onPushBomToQuote={handlePushBomToQuoteFromStudio}
                  onOpenFlashingOrders={() => setActiveTab('flashing_orders')}
                  onSaveToProject={(planes, layout, flashingAssignments, snapshot) => {
                    const activeP = projects.find((p) => p.id === selectedProjectId) || projects[0];
                    if (activeP) {
                      const updatedP = {
                        ...activeP,
                        roofAreaM2: snapshot?.bom?.totalRoofAreaM2 || activeP.roofAreaM2,
                        roofPlanModel: {
                          ...(activeP.roofPlanModel || {}),
                          ...(snapshot || {}),
                          planes,
                          layout,
                          flashingAssignments,
                          savedAt: new Date().toISOString()
                        }
                      };
                      handleUpdateProject(updatedP as any);
                    }
                  }}
                />
              )}

              {activeTab === 'schedule' && (
                <ScheduleCalendar
                  projects={projects}
                  teamMembers={teamMembers}
                  onUpdateProject={handleUpdateProject}
                  onOpenProjectDetails={handleOpenProjectDetails}
                />
              )}

              {activeTab === 'leads' && (
                <LeadPipeline
                  leads={leads}
                  onUpdateLead={handleUpdateLead}
                  onAddLead={handleAddLead}
                  onCreateQuoteFromLead={handleCreateQuoteFromLead}
                />
              )}

              {activeTab === 'projects' && (
                <ProjectProgress
                  projects={projects}
                  onUpdateProject={handleUpdateProject}
                  onOpenClientPortal={handleOpenClientPortal}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={setSelectedProjectId}
                />
              )}

              {activeTab === 'quotes' && (
                <QuoteBuilder
                  quotes={quotes}
                  leads={leads}
                  projects={projects}
                  catalogue={catalogue}
                  onUpdateQuote={handleUpdateQuote}
                  onAddQuote={handleAddQuote}
                  onUpdateProject={handleUpdateProject}
                  prefillLead={prefillQuoteLead}
                  onNavigateToCatalogue={() => setActiveTab('catalogue')}
                  onOpenClientPortalQuote={handleOpenQuoteInPortal}
                />
              )}

              {activeTab === 'approvals' && (
                <ApprovalQueueView
                  projects={projects}
                  onUpdateProject={handleUpdateProject}
                  onOpenProjectDetails={handleOpenProjectDetails}
                />
              )}

              {activeTab === 'catalogue' && (
                <PricingCatalogueManager
                  catalogue={catalogue}
                  onUpdateCatalogue={handleUpdateCatalogue}
                />
              )}

              {(activeTab === 'flashing_library' || activeTab === 'flashing_orders') && (
                <FlashingWorkshop
                  view={activeTab === 'flashing_orders' ? 'orders' : 'library'}
                  onChangeView={(view) => setActiveTab(view === 'orders' ? 'flashing_orders' : 'flashing_library')}
                  projects={projects}
                  activeMemberName={teamMembers[0]?.name || 'Archtech team'}
                />
              )}

              {activeTab === 'inventory' && (
                <InventoryManager
                  coils={coils}
                  accessories={accessories}
                  projects={projects}
                  onUpdateCoil={handleUpdateCoil}
                  onAddCoil={handleAddCoil}
                  onUpdateAccessory={handleUpdateAccessory}
                />
              )}

              {activeTab === 'site_visit' && (
                <OnsiteJobHub
                  projects={projects}
                  onUpdateProject={handleUpdateProject}
                  initialProjectId={selectedProjectId}
                  teamMembers={teamMembers}
                  inspections={inspections}
                  onAddInspection={handleAddInspection}
                />
              )}

              {activeTab === 'automations' && (
                <EmailAutomations
                  rules={emailRules}
                  outbox={outbox}
                  leads={leads}
                  onUpdateRule={handleUpdateRule}
                  onSendManualEmail={handleSendManualEmail}
                />
              )}
            </>
          )}
        </main>

        {/* Trade Footer (Hidden in fullscreen mobile CAD mode) */}
        {!isMobileFullscreenRoofing && (
          <footer className="bg-white border-t border-slate-200 mt-auto py-3 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">Archtech Architectural Roofing</span>
              <span>·</span>
              <span>Job Management & Client CRM Suite</span>
              <span>·</span>
              <span className="text-emerald-700 font-semibold">SiteWise Green Approved</span>
            </div>
            <div className="flex items-center gap-3">
              <span>Primary Supplier: <a href="https://www.theroofingstore.co.nz" target="_blank" rel="noreferrer" className="text-slate-900 font-medium hover:underline">The Roofing Store</a></span>
              <span>·</span>
              <span>Quality Workmanship & Weather Guarantee</span>
            </div>
          </footer>
        )}
      </div>

      <OfflineIndicator />

      {/* Labour Time Logging Modal */}
      <LogTimeModal
        isOpen={isLogTimeModalOpen}
        onClose={() => setIsLogTimeModalOpen(false)}
        projects={projects}
        activeProjectId={selectedProjectId}
        initialHours={1.5}
        onSaveTimeEntry={handleSaveTimeEntry}
      />

      {/* New Trade Job Modal */}
      <NewJobModal
        isOpen={isNewJobModalOpen}
        onClose={() => setIsNewJobModalOpen(false)}
        onAddProject={handleAddProject}
      />

      {/* OneDrive Cloud Sync Hub Modal */}
      <OneDriveSyncModal
        isOpen={isOneDriveModalOpen}
        onClose={() => setIsOneDriveModalOpen(false)}
        activeQuote={quotes[0]}
        activeProject={projects.find(p => p.id === selectedProjectId) || projects[0]}
        onSyncQuote={handleUpdateQuote}
      />

      {/* Internal Site Approvals Gate Modal (PM Review & Publish) */}
      <SiteApprovalQueueModal
        isOpen={isSiteApprovalsModalOpen}
        onClose={() => setIsSiteApprovalsModalOpen(false)}
        projects={projects}
        onUpdateProject={handleUpdateProject}
        activeProjectId={selectedProjectId}
      />

      {/* Global Smart Command Palette (Cmd+K / Ctrl+K) */}
      <SmartCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        quotes={quotes}
        projects={projects}
        leads={leads}
        onSelectQuote={(id) => {
          setIsClientPortalMode(false);
          setActiveTab('quotes');
        }}
        onSelectProject={(id) => {
          setSelectedProjectId(id);
          setIsClientPortalMode(false);
          setActiveTab('projects');
        }}
        onSelectLead={(id) => {
          setIsClientPortalMode(false);
          setActiveTab('leads');
        }}
        onOpenExactRoofing={() => {
          setIsClientPortalMode(false);
          setActiveTab('exact_roofing');
        }}
        onOpenSmartTakeoff={() => {
          setIsClientPortalMode(false);
          setActiveTab('quotes');
        }}
        onOpenCodeAudit={() => {
          setIsClientPortalMode(false);
          setActiveTab('quotes');
        }}
        onOpenAIPolisher={() => {
          setIsClientPortalMode(false);
          setActiveTab('quotes');
        }}
      />
    </div>
  );
}