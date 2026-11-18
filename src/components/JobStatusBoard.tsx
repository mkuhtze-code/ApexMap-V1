import React, { useState, useMemo } from 'react';
import { Project, JobWorkflowStage } from '../types/crm';
import { formatNZD } from '../utils/formatters';
import { 
  ArrowRight, 
  MapPin, 
  Clock, 
  Plus, 
  Search, 
  ShieldCheck, 
  Kanban,
  List,
  AlertCircle,
  SlidersHorizontal,
  ChevronRight,
  X,
  Check
} from 'lucide-react';

interface Props {
  projects: Project[];
  onUpdateProject: (updated: Project) => void;
  onOpenProjectDetails: (projectId: string) => void;
  onCreateQuoteForProject?: (project: Project) => void;
  onAddNewProject: () => void;
}

interface ColumnDef {
  key: JobWorkflowStage;
  label: string;
  shortLabel: string;
  sublabel: string;
}

const STAGES: ColumnDef[] = [
  {
    key: 'enquiry_measure',
    label: '1. Enquiry & Measure',
    shortLabel: 'Measure',
    sublabel: 'Site measure & architectural review'
  },
  {
    key: 'quoting',
    label: '2. Quoting & Scope',
    shortLabel: 'Quoting',
    sublabel: 'Custom pricing & takeoff tiers'
  },
  {
    key: 'quote_sent',
    label: '3. Quote Sent',
    shortLabel: 'Sent',
    sublabel: 'Client review & agreement'
  },
  {
    key: 'pre_start',
    label: '4. Pre-Start Prep',
    shortLabel: 'Pre-Start',
    sublabel: 'Materials & moisture check'
  },
  {
    key: 'active_onsite',
    label: '5. Active On-Site',
    shortLabel: 'On-Site',
    sublabel: 'Tray fixing & standing seam seaming'
  },
  {
    key: 'qa_snagging',
    label: '6. QA & Handover',
    shortLabel: 'QA & Snag',
    sublabel: 'Punch list & LBP sign-off'
  },
  {
    key: 'completed',
    label: '7. Completed',
    shortLabel: 'Complete',
    sublabel: 'PS3 & 25-yr warranty issued'
  }
];

export const JobStatusBoard: React.FC<Props> = ({
  projects,
  onUpdateProject,
  onOpenProjectDetails,
  onAddNewProject
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [profileFilter, setProfileFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [viewFormat, setViewFormat] = useState<'board' | 'list'>('board');
  
  // Column visibility for list view
  const [showAddressCol, setShowAddressCol] = useState(true);
  const [showArchitectCol, setShowArchitectCol] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Helper to determine stage
  const getJobStage = (proj: Project): JobWorkflowStage => {
    if (proj.jobStage) return proj.jobStage;
    if (proj.status === 'completed') return 'completed';
    if (proj.status === 'snagging') return 'qa_snagging';
    if (proj.status === 'in_progress') return 'active_onsite';
    if (proj.progressPercent > 20) return 'pre_start';
    return 'enquiry_measure';
  };

  const handleChangeStage = (project: Project, nextStage: JobWorkflowStage) => {
    const stageIndex = STAGES.findIndex(s => s.key === nextStage);
    const updatedProject: Project = {
      ...project,
      jobStage: nextStage,
      status: nextStage === 'completed' 
        ? 'completed' 
        : nextStage === 'qa_snagging' 
        ? 'snagging' 
        : nextStage === 'active_onsite' 
        ? 'in_progress' 
        : 'pre_construction',
      progressPercent: nextStage === 'completed' ? 100 : Math.max(project.progressPercent, (stageIndex + 1) * 14),
      activityFeed: [
        {
          id: `act-${Date.now()}`,
          entityId: project.id,
          entityType: 'project',
          type: 'milestone',
          title: `Moved to ${STAGES.find(c => c.key === nextStage)?.label}`,
          details: `Stage updated on Job Status Board.`,
          author: 'Operations',
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
        },
        ...(project.activityFeed || [])
      ]
    };
    onUpdateProject(updatedProject);
  };

  const handleAdvanceStage = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    const stageOrder: JobWorkflowStage[] = [
      'enquiry_measure',
      'quoting',
      'quote_sent',
      'pre_start',
      'active_onsite',
      'qa_snagging',
      'completed'
    ];
    const current = getJobStage(project);
    const currentIndex = stageOrder.indexOf(current);
    if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
      handleChangeStage(project, stageOrder[currentIndex + 1]);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch = 
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.projectNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.architect.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.siteAddress.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProfile = profileFilter === 'all' || p.profile === profileFilter;
      const matchesRegion = regionFilter === 'all' || p.region.toLowerCase().includes(regionFilter.toLowerCase());
      const matchesStage = stageFilter === 'all' || getJobStage(p) === stageFilter;

      return matchesSearch && matchesProfile && matchesRegion && matchesStage;
    });
  }, [projects, searchTerm, profileFilter, regionFilter, stageFilter]);

  // Overall statistics
  const activeProjects = projects.filter(p => p.status !== 'completed');
  const totalActiveValue = activeProjects.reduce((acc, p) => acc + (p.contractValueNZD || 0), 0);
  const onsiteCount = projects.filter(p => getJobStage(p) === 'active_onsite').length;
  
  // Projects with items requiring attention
  const attentionProjects = projects.filter(p => {
    const hasPendingVariations = (p.variations || []).some(v => v.status === 'pending_client');
    const hasPendingSubmissions = (p.siteUpdateSubmissions || []).some(s => s.approvalStatus === 'pending');
    return hasPendingVariations || hasPendingSubmissions;
  });

  const isFiltered = searchTerm !== '' || profileFilter !== 'all' || regionFilter !== 'all' || stageFilter !== 'all';

  const handleResetFilters = () => {
    setSearchTerm('');
    setProfileFilter('all');
    setRegionFilter('all');
    setStageFilter('all');
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* 1. CALM DASHBOARD HEADER & KPI METRICS                        */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Jobs & Pipeline
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track active installations, monitor trade stages, and review client milestones.
          </p>
        </div>

        {/* Primary Action Zone */}
        <div className="flex items-center gap-2.5">
          {/* View format switcher */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewFormat('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewFormat === 'board'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Board view by trade stage"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewFormat('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewFormat === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Compact list view"
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          <button
            onClick={onAddNewProject}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Job</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row (Single elevation, generous spacing, tabular figures) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 transition-colors">
          <span className="text-xs font-medium text-slate-500 block">Active Jobs</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {activeProjects.length}
            </span>
            <span className="text-xs text-slate-400">in pipeline</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 transition-colors">
          <span className="text-xs font-medium text-slate-500 block">On-Site Now</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-teal-700 tabular-nums">
              {onsiteCount}
            </span>
            <span className="text-xs text-slate-400">fixing & seaming</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 transition-colors">
          <span className="text-xs font-medium text-slate-500 block">Attention Required</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tabular-nums ${attentionProjects.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {attentionProjects.length}
            </span>
            <span className="text-xs text-slate-400">variations or approvals</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 transition-colors">
          <span className="text-xs font-medium text-slate-500 block">Active Pipeline Value</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {formatNZD(totalActiveValue)}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. ATTENTION REQUIRED STRIP (Answers "What needs doing?")     */}
      {/* ------------------------------------------------------------- */}
      {attentionProjects.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-semibold text-amber-950">
                {attentionProjects.length} project{attentionProjects.length > 1 ? 's' : ''} require attention:
              </span>{' '}
              <span className="text-amber-900">
                {attentionProjects.map(p => p.title).join(', ')}
              </span>
            </div>
          </div>
          <button
            onClick={() => onOpenProjectDetails(attentionProjects[0]?.id)}
            className="inline-flex items-center gap-1 font-semibold text-amber-950 hover:text-amber-800 underline underline-offset-2 shrink-0 cursor-pointer"
          >
            <span>Review {attentionProjects[0]?.title}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. SEARCH & REFINED FILTERS BAR                              */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Quick Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by job #, client, address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-slate-800 focus:outline-none transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Profile filter */}
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="all">All Profiles</option>
            <option value="Archtech Super Seam 38mm">Super Seam 38mm</option>
            <option value="Archtech Angle Seam">Angle Seam</option>
            <option value="Archtech Double Angle Seam">Double Angle Seam</option>
            <option value="Archtech Interlocking Panels">Interlocking Panels</option>
          </select>

          {/* Region filter */}
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="all">All Regions</option>
            <option value="Auckland">Auckland</option>
            <option value="Wanaka">Wanaka</option>
            <option value="Waiheke">Waiheke</option>
            <option value="Omaha">Omaha / Matakana</option>
          </select>

          {/* Reset button */}
          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear filters</span>
            </button>
          )}
        </div>

        {/* Counter and list column controls */}
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-900 font-semibold">{filteredProjects.length}</strong> of {projects.length} jobs
          </span>

          {viewFormat === 'list' && (
            <div className="relative">
              <button
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Columns</span>
              </button>

              {showColumnPicker && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-slate-200 shadow-lg p-2 z-30 space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={showAddressCol}
                      onChange={(e) => setShowAddressCol(e.target.checked)}
                      className="rounded text-sky-600 focus:ring-0"
                    />
                    <span>Site Address</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={showArchitectCol}
                      onChange={(e) => setShowArchitectCol(e.target.checked)}
                      className="rounded text-sky-600 focus:ring-0"
                    />
                    <span>Architect</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. KANBAN STATUS BOARD VIEW (COLUMNS BY STAGE)                */}
      {/* ------------------------------------------------------------- */}
      {viewFormat === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
          {STAGES.map((column) => {
            const colProjects = filteredProjects.filter((p) => getJobStage(p) === column.key);
            const colValue = colProjects.reduce((acc, p) => acc + (p.contractValueNZD || 0), 0);

            return (
              <div
                key={column.key}
                className="flex-shrink-0 w-80 bg-slate-100/70 rounded-xl p-3 flex flex-col max-h-[calc(100vh-250px)] border border-slate-200/80"
              >
                {/* Column Header */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 mb-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-900 tracking-wide truncate">
                      {column.label}
                    </h2>
                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      {colProjects.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{column.sublabel}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] font-mono">
                    <span className="text-slate-400">Total:</span>
                    <span className="font-semibold text-slate-800">{formatNZD(colValue)}</span>
                  </div>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                  {colProjects.map((project) => {
                    const pendingVariations = (project.variations || []).filter(v => v.status === 'pending_client');
                    const nextMilestone = (project.milestones || []).find(m => !m.completed);

                    return (
                      <div
                        key={project.id}
                        onClick={() => onOpenProjectDetails(project.id)}
                        className="bg-white rounded-xl p-3.5 border border-slate-200 hover:border-slate-400 transition-all cursor-pointer group space-y-2.5 shadow-2xs"
                      >
                        {/* Job Number & Progress */}
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                            {project.projectNumber}
                          </span>
                          <span className="text-slate-500 font-medium tabular-nums">
                            {project.progressPercent}%
                          </span>
                        </div>

                        {/* Title & Client */}
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 group-hover:text-sky-700 transition-colors line-clamp-1">
                            {project.title}
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            <span className="font-medium text-slate-700">{project.clientName}</span>
                            {project.architect && (
                              <span> · {project.architect}</span>
                            )}
                          </p>
                        </div>

                        {/* Site Address */}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{project.siteAddress}</span>
                        </div>

                        {/* Profile & Area summary */}
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px] flex items-center justify-between text-slate-700">
                          <span className="truncate max-w-[170px] font-medium">{project.profile}</span>
                          <span className="font-mono text-[10px] tabular-nums font-semibold shrink-0">{project.roofAreaM2} m²</span>
                        </div>

                        {/* Next Milestone */}
                        {nextMilestone && (
                          <div className="text-[10px] text-slate-600 flex items-start gap-1.5 bg-slate-50 p-1.5 rounded border border-slate-100">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-1">
                              Next: <strong className="font-medium text-slate-800">{nextMilestone.title}</strong>
                            </span>
                          </div>
                        )}

                        {/* Pending Variations Alert */}
                        {pendingVariations.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-amber-900 bg-amber-50 p-1.5 rounded border border-amber-200">
                            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="font-semibold">
                              {pendingVariations.length} Variation{pendingVariations.length > 1 ? 's' : ''} awaiting sign-off
                            </span>
                          </div>
                        )}

                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-slate-900 h-full rounded-full transition-all duration-300"
                            style={{ width: `${project.progressPercent}%` }}
                          />
                        </div>

                        {/* Footer: Value & Advance Button */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-900 text-xs tabular-nums">
                            {formatNZD(project.contractValueNZD)}
                          </span>

                          {column.key !== 'completed' && (
                            <button
                              type="button"
                              onClick={(e) => handleAdvanceStage(e, project)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                              title="Advance to next trade stage"
                            >
                              <span>Advance</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {colProjects.length === 0 && (
                    <div className="h-32 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl text-center p-3 text-xs text-slate-400">
                      <span>No jobs in this stage</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. COMPACT LIST VIEW                                          */}
      {/* ------------------------------------------------------------- */}
      {viewFormat === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filteredProjects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                    <th className="py-3 px-4">Job #</th>
                    <th className="py-3 px-4">Project & Client</th>
                    {showAddressCol && <th className="py-3 px-4">Site Address</th>}
                    {showArchitectCol && <th className="py-3 px-4">Architect</th>}
                    <th className="py-3 px-4">Profile & Area</th>
                    <th className="py-3 px-4">Stage</th>
                    <th className="py-3 px-4">Progress</th>
                    <th className="py-3 px-4 text-right">Value</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProjects.map((project) => {
                    const stage = STAGES.find(s => s.key === getJobStage(project)) || STAGES[0];
                    return (
                      <tr 
                        key={project.id}
                        onClick={() => onOpenProjectDetails(project.id)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                          {project.projectNumber}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{project.title}</div>
                          <div className="text-[11px] text-slate-500">{project.clientName}</div>
                        </td>

                        {showAddressCol && (
                          <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                            {project.siteAddress}
                          </td>
                        )}

                        {showArchitectCol && (
                          <td className="py-3.5 px-4 text-slate-600">
                            {project.architect || '—'}
                          </td>
                        )}

                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800">{project.profile}</div>
                          <div className="text-[10px] text-slate-400 font-mono tabular-nums">{project.roofAreaM2} m² · {project.colorName}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={stage.key}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleChangeStage(project, e.target.value as any)}
                            className="text-[11px] font-medium rounded-md px-2 py-1 bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none cursor-pointer"
                          >
                            {STAGES.map(s => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-slate-900 h-full rounded-full" style={{ width: `${project.progressPercent}%` }} />
                            </div>
                            <span className="tabular-nums">{project.progressPercent}%</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatNZD(project.contractValueNZD)}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProjectDetails(project.id);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-md text-[11px] cursor-pointer"
                          >
                            Open →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
              <p className="font-medium text-slate-800">No jobs match your search or filter.</p>
              <button
                onClick={handleResetFilters}
                className="mt-2 text-xs text-sky-700 font-medium hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
