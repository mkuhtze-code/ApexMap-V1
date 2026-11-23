import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  FolderKanban, 
  Calculator, 
  ShieldCheck,
  Calendar,
  Smartphone, 
  PenTool,
  Boxes, 
  BookOpen, 
  Eye, 
  Send, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Compass
} from 'lucide-react';
import { Project, Lead, Quote } from '../types/crm';
import { ArchtechLogo } from './ArchtechLogo';

export type NavTab = 
  | 'status_board' 
  | 'leads' 
  | 'projects' 
  | 'quotes' 
  | 'approvals'
  | 'exact_roofing'
  | 'schedule'
  | 'site_visit'
  | 'flashing_library'
  | 'flashing_orders'
  | 'inventory' 
  | 'catalogue' 
  | 'automations' 
  | 'client_portal';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  projects: Project[];
  leads?: Lead[];
  quotes?: Quote[];
  pendingApprovalsCount?: number;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isClientPortalMode: boolean;
  setIsClientPortalMode: (portal: boolean) => void;
  onQuickNewJob: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  projects,
  leads = [],
  quotes = [],
  pendingApprovalsCount,
  isCollapsed,
  setIsCollapsed,
  isClientPortalMode,
  setIsClientPortalMode,
  onQuickNewJob
}) => {
  // Compute pending approvals if not directly provided
  const computedPendingApprovals = pendingApprovalsCount ?? projects.reduce((acc, p) => 
    acc + (p.siteUpdateSubmissions || []).filter(s => s.approvalStatus === 'pending').length, 0
  );

  const activeProjectsCount = projects.filter(p => p.status !== 'completed').length;
  const activeLeadsCount = leads.length > 0 ? leads.length : 5;

  const navSections = [
    {
      title: 'Core CRM',
      items: [
        {
          key: 'status_board' as NavTab,
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: activeProjectsCount > 0 ? String(activeProjectsCount) : undefined,
          badgeVariant: 'neutral'
        },
        {
          key: 'leads' as NavTab,
          label: 'Leads & Enquiries',
          icon: Users,
          badge: activeLeadsCount > 0 ? String(activeLeadsCount) : undefined,
          badgeVariant: 'neutral'
        },
        {
          key: 'projects' as NavTab,
          label: 'Jobs & Projects',
          icon: FolderKanban,
        },
        {
          key: 'quotes' as NavTab,
          label: 'Quotes & Pricing',
          icon: Calculator,
        },
        {
          key: 'approvals' as NavTab,
          label: 'Approval Queue',
          icon: ShieldCheck,
          badge: computedPendingApprovals > 0 ? String(computedPendingApprovals) : undefined,
          badgeVariant: 'amber'
        }
      ]
    },
    {
      title: 'Operations',
      items: [
        {
          key: 'exact_roofing' as NavTab,
          label: 'ApexMap™ Studio',
          icon: Compass,
          badge: 'CAD',
          badgeVariant: 'sky'
        },
        {
          key: 'schedule' as NavTab,
          label: 'Crew Schedule',
          icon: Calendar,
        },
        {
          key: 'site_visit' as NavTab,
          label: 'ApexMap™ Onsite',
          icon: Smartphone,
          badge: 'Offcuts',
          badgeVariant: 'neutral'
        },
        {
          key: 'flashing_library' as NavTab,
          label: 'Flashing Workshop',
          icon: PenTool,
        },
        {
          key: 'inventory' as NavTab,
          label: 'Inventory & Coils',
          icon: Boxes,
        }
      ]
    },
    {
      title: 'Client & Supply',
      items: [
        {
          key: 'client_portal' as NavTab,
          label: 'Client Portal View',
          icon: Eye,
        },
        {
          key: 'catalogue' as NavTab,
          label: 'Price Book (TRS)',
          icon: BookOpen,
        },
        {
          key: 'automations' as NavTab,
          label: 'Email Automations',
          icon: Send,
        }
      ]
    }
  ];

  return (
    <aside
      className={`bg-slate-900 text-slate-200 border-r border-slate-800 flex flex-col shrink-0 min-h-0 h-full transition-all duration-200 z-30 select-none ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40">
        {!isCollapsed ? (
          <div className="flex items-center gap-2 overflow-hidden py-1 max-w-[170px]">
            <ArchtechLogo variant="dark" className="h-7 w-auto max-w-[160px] object-left" />
          </div>
        ) : (
          <div className="mx-auto flex items-center justify-center py-1">
            <ArchtechLogo variant="icon" className="w-7 h-7 object-contain" />
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5" aria-label="Main Navigation">
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1">
            {!isCollapsed && (
              <h2 className="px-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {section.title}
              </h2>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isSelected = activeTab === item.key && !isClientPortalMode;
                const isPortalActive = item.key === 'client_portal' && isClientPortalMode;
                const active = isSelected || isPortalActive;

                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      if (item.key === 'client_portal') {
                        setIsClientPortalMode(true);
                      } else {
                        setIsClientPortalMode(false);
                        setActiveTab(item.key);
                      }
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer group ${
                      active
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                    
                    {!isCollapsed && (
                      <div className="flex-1 min-w-0 flex items-center justify-between">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded tabular-nums shrink-0 ${
                              active
                                ? 'bg-white/20 text-white'
                                : item.badgeVariant === 'amber'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Quick Action Button */}
      {!isCollapsed && (
        <div className="p-2.5 border-t border-slate-800">
          <button
            onClick={onQuickNewJob}
            className="w-full py-2 px-3 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-700/60"
          >
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            <span>New Job / Lead</span>
          </button>
        </div>
      )}

      {/* User profile */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950/40 text-xs">
        {!isCollapsed ? (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold shrink-0 text-xs">
              MK
            </div>
            <div className="truncate">
              <span className="block font-semibold text-slate-200 text-xs truncate">Marcus Kuhtze</span>
              <span className="text-[10px] text-slate-400 block truncate">Site Supervisor · LBP</span>
            </div>
          </div>
        ) : (
          <div className="w-7 h-7 mx-auto rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs" title="Marcus Kuhtze (LBP)">
            MK
          </div>
        )}
      </div>
    </aside>
  );
};