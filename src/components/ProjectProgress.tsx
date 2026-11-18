import React, { useState } from 'react';
import { 
  Project, 
  MilestoneItem, 
  ProjectVariation, 
  TimeEntry, 
  JobWorkflowStage,
  JobChecklistItem,
  ArchitecturalPlan,
  SiteScheduleEvent,
  TeamMember,
  SiteProgressUpdateSubmission
} from '../types/crm';
import { formatNZD, formatDate } from '../utils/formatters';
import { PlanMarkupTool } from './PlanMarkupTool';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  Plus, 
  ExternalLink,
  ShieldCheck, 
  AlertTriangle, 
  Search, 
  Phone, 
  Mail, 
  Calendar, 
  Building, 
  MapPin, 
  ArrowRight, 
  DollarSign, 
  X, 
  Check, 
  ClipboardList,
  Layers,
  Camera,
  FileText,
  Compass,
  Scissors
} from 'lucide-react';
import { RoofMapOffcutVisualizer } from './longrun/RoofMapOffcutVisualizer';
import { generateInitialLongRunData } from '../utils/longRunRoofEngine';

interface Props {
  projects: Project[];
  onUpdateProject: (updated: Project) => void;
  onOpenClientPortal: (projectId: string) => void;
  selectedProjectId?: string;
  onSelectProject?: (id: string) => void;
  teamMembers?: TeamMember[];
}

type TabType = 'overview' | 'roof_plan_map' | 'checklist' | 'financials' | 'plans_photos';

const STAGES_LIST: { key: JobWorkflowStage; label: string }[] = [
  { key: 'enquiry_measure', label: '1. Measure' },
  { key: 'quoting', label: '2. Quoting' },
  { key: 'quote_sent', label: '3. Quote Sent' },
  { key: 'pre_start', label: '4. Pre-Start' },
  { key: 'active_onsite', label: '5. On-Site' },
  { key: 'qa_snagging', label: '6. QA Handover' },
  { key: 'completed', label: '7. Complete' }
];

export const ProjectProgress: React.FC<Props> = ({
  projects,
  onUpdateProject,
  onOpenClientPortal,
  selectedProjectId: externalSelectedId,
  onSelectProject: externalOnSelect,
  teamMembers = []
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string>(projects[0]?.id || '');
  const selectedProjectId = externalSelectedId || internalSelectedId;
  const setSelectedProjectId = (id: string) => {
    if (externalOnSelect) externalOnSelect(id);
    setInternalSelectedId(id);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [activeMarkupPlan, setActiveMarkupPlan] = useState<ArchitecturalPlan | null>(null);

  // Modals state
  const [isAddVariationOpen, setIsAddVariationOpen] = useState(false);
  const [newVarTitle, setNewVarTitle] = useState('');
  const [newVarDesc, setNewVarDesc] = useState('');
  const [newVarAmount, setNewVarAmount] = useState<number>(1500);

  const [isRecordSiteProgressOpen, setIsRecordSiteProgressOpen] = useState(false);
  const [siteNotes, setSiteNotes] = useState('');
  const [siteProposedPercent, setSiteProposedPercent] = useState<number>(selectedProject?.progressPercent || 30);
  const [sitePhotoUrl, setSitePhotoUrl] = useState('');

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-slate-500">
        No projects available.
      </div>
    );
  }

  // Handlers
  const handleChangeStage = (nextStage: JobWorkflowStage) => {
    const stageIndex = STAGES_LIST.findIndex(s => s.key === nextStage);
    const updated: Project = {
      ...selectedProject,
      jobStage: nextStage,
      status: nextStage === 'completed' 
        ? 'completed' 
        : nextStage === 'qa_snagging' 
        ? 'snagging' 
        : nextStage === 'active_onsite' 
        ? 'in_progress' 
        : 'pre_construction',
      progressPercent: nextStage === 'completed' ? 100 : Math.max(selectedProject.progressPercent, (stageIndex + 1) * 14),
      activityFeed: [
        {
          id: `act-${Date.now()}`,
          entityId: selectedProject.id,
          entityType: 'project',
          type: 'milestone',
          title: `Moved to ${STAGES_LIST.find(s => s.key === nextStage)?.label}`,
          details: `Stage updated on Job Hub.`,
          author: teamMembers[0]?.name || 'Operations',
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
        },
        ...(selectedProject.activityFeed || [])
      ]
    };
    onUpdateProject(updated);
  };

  const handleToggleMilestone = (milestoneId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const updatedMilestones = (selectedProject.milestones || []).map(m => {
      if (m.id === milestoneId) {
        const nextState = !m.completed;
        return {
          ...m,
          completed: nextState,
          completedAt: nextState ? today : undefined,
          inspectorName: nextState ? (teamMembers[0]?.name || 'Marcus Kuhtze (LBP)') : undefined
        };
      }
      return m;
    });

    const total = updatedMilestones.length;
    const completed = updatedMilestones.filter(m => m.completed).length;
    const calculatedProgress = Math.round((completed / total) * 100);

    const updated: Project = {
      ...selectedProject,
      milestones: updatedMilestones,
      progressPercent: calculatedProgress,
      activityFeed: [
        {
          id: `act-${Date.now()}`,
          entityId: selectedProject.id,
          entityType: 'project',
          type: 'milestone',
          title: `Milestone updated: ${updatedMilestones.find(m => m.id === milestoneId)?.title}`,
          details: `Status toggled. Project progress now at ${calculatedProgress}%.`,
          author: teamMembers[0]?.name || 'Supervisor',
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
        },
        ...(selectedProject.activityFeed || [])
      ]
    };

    onUpdateProject(updated);
  };

  const handleToggleChecklistItem = (itemId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const currentList: JobChecklistItem[] = selectedProject.customChecklist || [];
    const updatedList = currentList.map(item => {
      if (item.id === itemId) {
        const nextState = !item.completed;
        return {
          ...item,
          completed: nextState,
          status: (nextState ? 'pass' : 'pending') as 'pass' | 'pending',
          completedAt: nextState ? today : undefined,
          inspectorName: nextState ? (teamMembers[0]?.name || 'Marcus Kuhtze (LBP)') : undefined
        };
      }
      return item;
    });

    onUpdateProject({
      ...selectedProject,
      customChecklist: updatedList
    });
  };

  const handleApproveVariation = (variationId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const updatedVars = (selectedProject.variations || []).map(v => {
      if (v.id === variationId) {
        return { ...v, status: 'approved' as const, approvedAt: today };
      }
      return v;
    });
    onUpdateProject({ ...selectedProject, variations: updatedVars });
  };

  const handleDeclineVariation = (variationId: string) => {
    const updatedVars = (selectedProject.variations || []).map(v => {
      if (v.id === variationId) {
        return { ...v, status: 'declined' as const };
      }
      return v;
    });
    onUpdateProject({ ...selectedProject, variations: updatedVars });
  };

  const handleAddVariationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVarTitle.trim()) return;
    const newVar: ProjectVariation = {
      id: `var-${Date.now()}`,
      title: newVarTitle.trim(),
      description: newVarDesc.trim(),
      amountNZD: Number(newVarAmount) || 0,
      status: 'pending_client',
      requestedAt: new Date().toISOString().split('T')[0]
    };
    onUpdateProject({
      ...selectedProject,
      variations: [...(selectedProject.variations || []), newVar]
    });
    setIsAddVariationOpen(false);
    setNewVarTitle('');
    setNewVarDesc('');
    setNewVarAmount(1500);
  };

  const handleRecordSiteProgressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submission: SiteProgressUpdateSubmission = {
      id: `sub-${Date.now()}`,
      projectId: selectedProject.id,
      submittedAt: new Date().toISOString(),
      submittedBy: teamMembers[0]?.name || 'Marcus Kuhtze',
      proposedProgressPercent: siteProposedPercent,
      notes: siteNotes.trim(),
      photoUrls: sitePhotoUrl.trim() ? [sitePhotoUrl.trim()] : [],
      approvalStatus: 'pending',
      publishedToClient: false
    };

    onUpdateProject({
      ...selectedProject,
      siteUpdateSubmissions: [submission, ...(selectedProject.siteUpdateSubmissions || [])]
    });
    setIsRecordSiteProgressOpen(false);
    setSiteNotes('');
    setSitePhotoUrl('');
  };

  const totalContract = selectedProject.contractValueNZD || 0;
  const approvedVariations = (selectedProject.variations || []).filter(v => v.status === 'approved');
  const pendingVariations = (selectedProject.variations || []).filter(v => v.status === 'pending_client');
  const variationsTotal = approvedVariations.reduce((sum, v) => sum + v.amountNZD, 0);
  const adjustedContract = totalContract + variationsTotal;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* 1. PROJECT SELECTOR & MAIN HEADER                             */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        {/* Project Dropdown & Primary Action Zone */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                  {selectedProject.projectNumber}
                </span>
                <span>·</span>
                <span className="truncate">{selectedProject.clientName}</span>
                <span>·</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> LBP Supervised
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1 truncate">
                {selectedProject.title}
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{selectedProject.siteAddress}</span>
              </p>
            </div>
          </div>

          {/* Project Switcher & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedProject.id}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.projectNumber} — {p.title}
                </option>
              ))}
            </select>

            <button
              onClick={() => onOpenClientPortal(selectedProject.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Client Portal</span>
            </button>

            <button
              onClick={() => setIsRecordSiteProgressOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-slate-500" />
              <span>Log Site Update</span>
            </button>
          </div>
        </div>

        {/* Trade Stage Stepper (Clean & Scannable) */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
            {STAGES_LIST.map((stage, idx) => {
              const isCurrent = (selectedProject.jobStage || 'active_onsite') === stage.key;
              const currentIndex = STAGES_LIST.findIndex(s => s.key === (selectedProject.jobStage || 'active_onsite'));
              const isPast = idx < currentIndex;

              return (
                <button
                  key={stage.key}
                  onClick={() => handleChangeStage(stage.key)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                    isCurrent
                      ? 'bg-sky-600 text-white font-semibold shadow-2xs'
                      : isPast
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {isPast && <Check className="w-3 h-3 text-emerald-600" />}
                  <span>{stage.label}</span>
                </button>
              );
            })}
          </div>

          {/* Progress % Bar */}
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <span className="text-slate-500">Progress:</span>
            <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-slate-900 h-full rounded-full transition-all duration-300"
                style={{ width: `${selectedProject.progressPercent}%` }}
              />
            </div>
            <span className="font-mono font-bold text-slate-900 tabular-nums">
              {selectedProject.progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. REFINED NAVIGATION TABS                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Overview & Timeline
        </button>
        <button
          onClick={() => setActiveTab('roof_plan_map')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'roof_plan_map'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-sky-600" />
          <span>ApexMap™ Roof Plan</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Offcuts &amp; Measure
          </span>
        </button>
        <button
          onClick={() => setActiveTab('checklist')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'checklist'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <span>Quality Checklist</span>
          {selectedProject.customChecklist && (
            <span className="text-[10px] font-mono px-1 rounded bg-slate-100 text-slate-600">
              {selectedProject.customChecklist.filter(c => c.completed).length}/{selectedProject.customChecklist.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('financials')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'financials'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <span>Financials & Variations</span>
          {pendingVariations.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 rounded-full bg-amber-500 text-white font-bold">
              {pendingVariations.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('plans_photos')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'plans_photos'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          Drawings & Site Photos
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. TAB CONTENT                                                */}
      {/* ------------------------------------------------------------- */}

      {/* TAB 1: OVERVIEW & TIMELINE */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metric Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500 block">Total Contract (Adjusted)</span>
              <span className="text-xl font-bold text-slate-900 font-mono mt-1 block tabular-nums">
                {formatNZD(adjustedContract)}
              </span>
              <span className="text-[11px] text-slate-400">Orig: {formatNZD(totalContract)}</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500 block">Profile & Area</span>
              <span className="text-sm font-bold text-slate-900 mt-1 block truncate">
                {selectedProject.profile}
              </span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">{selectedProject.roofAreaM2} m² @ {selectedProject.roofPitchDegrees || 4}° pitch</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500 block">Target Completion</span>
              <span className="text-sm font-bold text-slate-900 mt-1 block">
                {formatDate(selectedProject.estimatedCompletionDate || selectedProject.targetCompletionDate || '2026-05-15')}
              </span>
              <span className="text-[11px] text-slate-400">Install start: {formatDate(selectedProject.installStartDate || '2026-03-10')}</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500 block">Material & Warranty</span>
              <span className="text-sm font-bold text-slate-900 mt-1 block truncate">
                {selectedProject.material}
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold">25-Year Quality & Weather Warranty</span>
            </div>
          </div>

          {/* Split 2-Column: Milestones Timeline + Contacts & Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Milestones Timeline */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">
                  Milestones & Delivery Schedule
                </h3>
                <span className="text-xs text-slate-400">Click to sign off</span>
              </div>

              <div className="divide-y divide-slate-100">
                {(selectedProject.milestones || []).map((m) => (
                  <div
                    key={m.id}
                    onClick={() => handleToggleMilestone(m.id)}
                    className="py-3 flex items-start justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        m.completed ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300 group-hover:border-slate-500'
                      }`}>
                        {m.completed && <Check className="w-3 h-3" />}
                      </div>
                      <div>
                        <div className={`text-xs font-semibold ${m.completed ? 'text-slate-900 line-through text-slate-400' : 'text-slate-800'}`}>
                          {m.title}
                        </div>
                        {m.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{m.description}</p>
                        )}
                        {m.completed && m.inspectorName && (
                          <span className="text-[10px] text-emerald-700 block mt-0.5">
                            ✓ Verified by {m.inspectorName} on {m.completedAt}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      m.completed ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {m.completed ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Contacts & Recent Activity */}
            <div className="space-y-6">
              {/* Contacts */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm">
                  Project Stakeholders
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Client</span>
                    <span className="font-bold text-slate-900 block mt-0.5">{selectedProject.clientName}</span>
                    <span className="text-slate-500 text-[11px] block">{selectedProject.clientEmail}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Architect</span>
                    <span className="font-bold text-slate-900 block mt-0.5">{selectedProject.architect}</span>
                    <span className="text-slate-500 text-[11px] block">Lead Designer</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Head Builder</span>
                    <span className="font-bold text-slate-900 block mt-0.5">{selectedProject.headContractor}</span>
                    <span className="text-slate-500 text-[11px] block">Site Contact</span>
                  </div>
                </div>
              </div>

              {/* Activity Feed */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm">
                  Recent Activity Log
                </h3>
                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-xs">
                  {(selectedProject.activityFeed || []).slice(0, 5).map((act) => (
                    <div key={act.id} className="py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{act.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{act.timestamp}</span>
                      </div>
                      <p className="text-slate-500 text-[11px] mt-0.5">{act.details}</p>
                    </div>
                  ))}
                  {(!selectedProject.activityFeed || selectedProject.activityFeed.length === 0) && (
                    <p className="text-slate-400 py-3">No activity logged yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: QUALITY CHECKLIST */}
      {activeTab === 'checklist' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                NZBC E2/AS1 & MRM Code of Practice QA Checklist
              </h3>
              <p className="text-xs text-slate-500">
                Verified on-site by Licensed Building Practitioner Marcus Kuhtze (BP134821).
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md self-start sm:self-auto">
              {(selectedProject.customChecklist || []).filter(c => c.completed).length} of {(selectedProject.customChecklist || []).length} items signed off
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {(selectedProject.customChecklist || []).map((item) => (
              <div
                key={item.id}
                onClick={() => handleToggleChecklistItem(item.id)}
                className="py-3.5 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50/60 transition-colors p-2 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    item.completed ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300'
                  }`}>
                    {item.completed && <Check className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                      {item.category}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 block mt-0.5">
                      {item.label}
                    </span>
                    {item.notes && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{item.notes}</p>
                    )}
                    {item.completed && item.completedAt && (
                      <span className="text-[10px] text-emerald-700 block mt-1">
                        Passed by {item.inspectorName || 'Marcus Kuhtze (LBP)'} on {item.completedAt}
                      </span>
                    )}
                  </div>
                </div>

                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold shrink-0 ${
                  item.completed ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {item.completed ? 'PASSED' : 'PENDING'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: FINANCIALS & VARIATIONS */}
      {activeTab === 'financials' && (
        <div className="space-y-6">
          {/* Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500 block">Original Contract</span>
              <span className="text-2xl font-bold text-slate-900 font-mono mt-1 block tabular-nums">
                {formatNZD(totalContract)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500 block">Approved Variations</span>
              <span className="text-2xl font-bold text-emerald-700 font-mono mt-1 block tabular-nums">
                +{formatNZD(variationsTotal)}
              </span>
              <span className="text-[11px] text-slate-400">{approvedVariations.length} approved</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500 block">Adjusted Total Value</span>
              <span className="text-2xl font-bold text-slate-900 font-mono mt-1 block tabular-nums">
                {formatNZD(adjustedContract)}
              </span>
            </div>
          </div>

          {/* Variations Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Project Variations
                </h3>
                <p className="text-xs text-slate-500">
                  Site additions, detailing alterations, and client upgrades.
                </p>
              </div>

              <button
                onClick={() => setIsAddVariationOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Variation</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {(selectedProject.variations || []).map((v) => (
                <div key={v.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{v.title}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        v.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-800'
                          : v.status === 'declined'
                          ? 'bg-rose-50 text-rose-800'
                          : 'bg-amber-50 text-amber-800'
                      }`}>
                        {v.status.replace('_', ' ')}
                      </span>
                    </div>
                    {v.description && <p className="text-slate-500 text-[11px] mt-0.5">{v.description}</p>}
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">Requested: {v.requestedAt}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatNZD(v.amountNZD)}
                    </span>

                    {v.status === 'pending_client' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleApproveVariation(v.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md cursor-pointer transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeclineVariation(v.id)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {(!selectedProject.variations || selectedProject.variations.length === 0) && (
                <p className="text-slate-400 py-4 text-center">No variations requested on this project.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PLANS & PHOTOS */}
      {activeTab === 'plans_photos' && (
        <div className="space-y-6">
          {/* Architectural Plans with Markup Tool */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">
              Architectural Drawings & Roof Plan
            </h3>

            {activeMarkupPlan ? (
              <div className="space-y-3">
                <button
                  onClick={() => setActiveMarkupPlan(null)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  ← Back to plans overview
                </button>
                <PlanMarkupTool
                  project={selectedProject}
                  plan={activeMarkupPlan}
                  memberName={teamMembers[0]?.name || 'Marcus Kuhtze'}
                  onUpdateProject={onUpdateProject}
                  onClose={() => setActiveMarkupPlan(null)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {(selectedProject.architecturalPlans || []).map((plan) => (
                  <div
                    key={plan.id}
                    onClick={() => setActiveMarkupPlan(plan)}
                    className="p-3 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200 cursor-pointer group transition-all"
                  >
                    <div className="aspect-video bg-white rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center p-2">
                      <span className="font-mono text-xs font-semibold text-slate-500 group-hover:text-sky-700">
                        {plan.sheetNumber} · {plan.title}
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <span className="font-bold text-xs text-slate-900 block group-hover:text-sky-700 truncate">
                        {plan.title}
                      </span>
                      <span className="text-[11px] text-slate-400 block font-mono">
                        Rev {plan.revision} · {plan.scale}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Site Inspection Photos */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Site Photos & Quality Verification
                </h3>
                <p className="text-xs text-slate-500">
                  Progress photos taken on site during framing, underlay, tray lay and flashing seaming.
                </p>
              </div>

              <button
                onClick={() => setIsRecordSiteProgressOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Add Site Photo</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(selectedProject.photos || []).map((photo) => (
                <div key={photo.id} className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                  <div className="aspect-square bg-slate-200 relative overflow-hidden">
                    <img
                      src={photo.url}
                      alt={photo.caption}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="p-2.5 text-xs">
                    <p className="text-slate-800 font-medium truncate">{photo.caption}</p>
                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{photo.takenAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: APEXMAP™ ROOF PLAN & OFFCUT OPTIMIZER */}
      {activeTab === 'roof_plan_map' && (
        <div className="space-y-4">
          <RoofMapOffcutVisualizer
            project={selectedProject}
            projects={projects}
            initialStage={
              selectedProject?.roofPlanModel?.stage ||
              (selectedProject?.roofPlanModel?.measureLocked ? 'installing' : 'measuring')
            }
            onSelectProject={setSelectedProjectId}
            facets={
              selectedProject.roofMapFacets && selectedProject.roofMapFacets.length > 0
                ? selectedProject.roofMapFacets
                : generateInitialLongRunData(selectedProject).facets
            }
            onUpdateFacets={(updatedFacets) => {
              onUpdateProject({
                ...selectedProject,
                roofMapFacets: updatedFacets
              });
            }}
            onUpdateProject={onUpdateProject}
            embedded={true}
            profileKey="trapezoidal_5rib"
            gauge="0.55mm"
            colorName={selectedProject.colorName || 'FlaxPod'}
            isManagerView={true}
            onSaveToProject={(updatedFacets, planModel) => {
              onUpdateProject({
                ...selectedProject,
                roofMapFacets: updatedFacets,
                roofPlanModel: planModel,
                roofAreaM2: planModel?.bom?.totalRoofAreaM2 || selectedProject.roofAreaM2
              });
            }}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. LIGHTWEIGHT MODALS                                         */}
      {/* ------------------------------------------------------------- */}

      {/* Add Variation Modal */}
      {isAddVariationOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 shadow-xl space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add Project Variation</h3>
              <button
                onClick={() => setIsAddVariationOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddVariationSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Variation Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Parapet Flashing Extension (Additional 18 lm)"
                  value={newVarTitle}
                  onChange={(e) => setNewVarTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description / Scope Notes</label>
                <textarea
                  rows={2}
                  placeholder="Specify profile, material, and reason for variation..."
                  value={newVarDesc}
                  onChange={(e) => setNewVarDesc(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Variation Amount (NZD)</label>
                <input
                  type="number"
                  step="50"
                  value={newVarAmount}
                  onChange={(e) => setNewVarAmount(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none font-mono tabular-nums"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddVariationOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Submit Variation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Site Progress Modal */}
      {isRecordSiteProgressOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 shadow-xl space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Log Site Progress Update</h3>
              <button
                onClick={() => setIsRecordSiteProgressOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordSiteProgressSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Proposed Progress %</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={siteProposedPercent}
                    onChange={(e) => setSiteProposedPercent(Number(e.target.value))}
                    className="flex-1 cursor-pointer accent-slate-900"
                  />
                  <span className="font-mono font-bold text-slate-900 w-12 text-right">{siteProposedPercent}%</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Daily Site Notes *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Underlay completed across main pitch. Standing seam trays rollformed and 60% fixed."
                  value={siteNotes}
                  onChange={(e) => setSiteNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Site Photo URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://... or photo file URL"
                  value={sitePhotoUrl}
                  onChange={(e) => setSitePhotoUrl(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-[11px]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordSiteProgressOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Submit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
