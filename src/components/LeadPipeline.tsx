import React, { useState } from 'react';
import { 
  Lead, 
  LeadStage, 
  WindZone, 
  ExposureZone, 
  RoofingProfile, 
  CoilMaterial 
} from '../types/crm';
import { formatNZD, formatDate } from '../utils/formatters';
import { 
  Plus, 
  Search, 
  Building, 
  ArrowRight, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  X,
  Compass,
  Kanban,
  List,
  Calendar,
  Check,
  Sparkles
} from 'lucide-react';

interface Props {
  leads: Lead[];
  onUpdateLead: (updated: Lead) => void;
  onAddLead: (newLead: Lead) => void;
  onCreateQuoteFromLead: (lead: Lead) => void;
}

const STAGES: { key: LeadStage; label: string }[] = [
  { key: 'new_inquiry', label: '1. New Enquiries' },
  { key: 'site_measure', label: '2. Site Measure' },
  { key: 'quoting', label: '3. Quoting' },
  { key: 'quote_sent', label: '4. Quote Sent' },
  { key: 'contract_signed', label: '5. Contract Signed' },
  { key: 'in_production', label: '6. In Production' },
];

export const LeadPipeline: React.FC<Props> = ({
  leads,
  onUpdateLead,
  onAddLead,
  onCreateQuoteFromLead,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

  // Form state for new lead
  const [newLeadForm, setNewLeadForm] = useState<Partial<Lead>>({
    clientName: '',
    companyOrArchitect: '',
    email: '',
    phone: '',
    projectAddress: '',
    region: 'Auckland',
    roofAreaM2: 240,
    pitchDegrees: 4,
    windZone: 'High',
    exposureZone: 'Zone C (Medium)',
    profilePreferred: 'Archtech Super Seam 38mm',
    materialPreferred: 'The Roofing Store MagnaFlow®',
    estimatedValueNZD: 65000,
    stage: 'new_inquiry',
    notes: []
  });

  // Filtered leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = 
      lead.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.companyOrArchitect && lead.companyOrArchitect.toLowerCase().includes(searchTerm.toLowerCase())) ||
      lead.projectAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.region.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRegion = regionFilter === 'all' || lead.region.toLowerCase().includes(regionFilter.toLowerCase());
    return matchesSearch && matchesRegion;
  });

  const totalPipelineNZD = filteredLeads.reduce((acc, l) => acc + l.estimatedValueNZD, 0);
  const totalAreaM2 = filteredLeads.reduce((acc, l) => acc + l.roofAreaM2, 0);
  const averageLeadNZD = filteredLeads.length > 0 ? totalPipelineNZD / filteredLeads.length : 0;

  const handleStageAdvance = (lead: Lead) => {
    const stageOrder: LeadStage[] = [
      'new_inquiry', 
      'site_measure', 
      'quoting', 
      'quote_sent', 
      'contract_signed', 
      'in_production', 
      'won'
    ];
    const currentIndex = stageOrder.indexOf(lead.stage);
    if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
      const nextStage = stageOrder[currentIndex + 1];
      const updated = { ...lead, stage: nextStage };
      onUpdateLead(updated);
      if (selectedLead?.id === lead.id) setSelectedLead(updated);
    }
  };

  const handleAddNote = () => {
    if (!selectedLead || !newNoteText.trim()) return;
    const dateStamp = new Date().toISOString().split('T')[0];
    const updatedNotes = [
      `${dateStamp}: ${newNoteText.trim()}`,
      ...selectedLead.notes
    ];
    const updated = { ...selectedLead, notes: updatedNotes };
    onUpdateLead(updated);
    setSelectedLead(updated);
    setNewNoteText('');
  };

  const handleCreateLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadForm.clientName || !newLeadForm.projectAddress) return;

    const created: Lead = {
      id: `lead-${Date.now()}`,
      clientName: newLeadForm.clientName || 'New Client',
      companyOrArchitect: newLeadForm.companyOrArchitect || 'Direct Client',
      email: newLeadForm.email || 'client@example.co.nz',
      phone: newLeadForm.phone || '+64 21 000 0000',
      projectAddress: newLeadForm.projectAddress || 'Auckland, NZ',
      region: newLeadForm.region || 'Auckland',
      roofAreaM2: Number(newLeadForm.roofAreaM2) || 200,
      pitchDegrees: Number(newLeadForm.pitchDegrees) || 4,
      windZone: (newLeadForm.windZone as WindZone) || 'High',
      exposureZone: (newLeadForm.exposureZone as ExposureZone) || 'Zone C (Medium)',
      profilePreferred: (newLeadForm.profilePreferred as RoofingProfile) || 'Archtech Super Seam 38mm',
      materialPreferred: (newLeadForm.materialPreferred as CoilMaterial) || 'The Roofing Store MagnaFlow®',
      estimatedValueNZD: Number(newLeadForm.estimatedValueNZD) || 65000,
      stage: 'new_inquiry',
      createdAt: new Date().toISOString().split('T')[0],
      nextFollowUpDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      notes: [
        `Inquiry logged: ${newLeadForm.profilePreferred} specification in ${newLeadForm.region}.`
      ]
    };

    onAddLead(created);
    setIsAddModalOpen(false);
    setSelectedLead(created);
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* 1. HEADER & KPI CARDS                                         */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Leads & Enquiries
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage inbound architectural requests, track scopes, and generate fast quotes.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Enquiry</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500 block">Total Pipeline Value</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {formatNZD(totalPipelineNZD)}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500 block">Active Enquiries</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {filteredLeads.length}
            </span>
            <span className="text-xs text-slate-400">clients</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500 block">Average Estimate</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {formatNZD(averageLeadNZD)}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500 block">Specified Area</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {totalAreaM2.toLocaleString()} m²
            </span>
            <span className="text-xs text-slate-400">total tray</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. SEARCH & FILTER BAR                                        */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by client, architect, address..."
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

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="all">All Regions</option>
            <option value="Auckland">Auckland</option>
            <option value="Wanaka">Wanaka / Queenstown</option>
            <option value="Waiheke">Waiheke Island</option>
            <option value="Omaha">Omaha / Matakana</option>
          </select>

          {(searchTerm || regionFilter !== 'all') && (
            <button
              onClick={() => { setSearchTerm(''); setRegionFilter('all'); }}
              className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        <span className="text-xs text-slate-500">
          Showing <strong className="text-slate-900 font-semibold">{filteredLeads.length}</strong> enquiries
        </span>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. KANBAN BOARD OR LIST VIEW                                  */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
          {STAGES.map((stage) => {
            const stageLeads = filteredLeads.filter((l) => l.stage === stage.key);
            const stageTotal = stageLeads.reduce((acc, l) => acc + l.estimatedValueNZD, 0);

            return (
              <div
                key={stage.key}
                className="flex-shrink-0 w-80 bg-slate-100/70 rounded-xl p-3 flex flex-col max-h-[calc(100vh-250px)] border border-slate-200/80"
              >
                {/* Stage Header */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 mb-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-900 tracking-wide truncate">
                      {stage.label}
                    </h2>
                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      {stageLeads.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] font-mono">
                    <span className="text-slate-400">Total:</span>
                    <span className="font-semibold text-slate-800">{formatNZD(stageTotal)}</span>
                  </div>
                </div>

                {/* Leads Cards */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`bg-white rounded-xl p-3.5 border transition-all cursor-pointer group space-y-2.5 shadow-2xs ${
                        selectedLead?.id === lead.id ? 'border-sky-600 ring-1 ring-sky-600' : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="text-xs font-bold text-slate-900 group-hover:text-sky-700 transition-colors line-clamp-1">
                          {lead.clientName}
                        </h3>
                        <span className="text-xs font-mono tabular-nums font-bold text-slate-900 shrink-0">
                          {formatNZD(lead.estimatedValueNZD)}
                        </span>
                      </div>

                      {lead.companyOrArchitect && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{lead.companyOrArchitect}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{lead.projectAddress}</span>
                      </div>

                      {/* Quiet metadata line */}
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px] flex items-center justify-between text-slate-700">
                        <span className="truncate max-w-[170px] font-medium">{lead.profilePreferred}</span>
                        <span className="font-mono text-[10px] tabular-nums font-semibold shrink-0">{lead.roofAreaM2} m²</span>
                      </div>

                      {/* Footer: Follow up & Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          Follow-up: <strong className="text-slate-700 font-medium">{formatDate(lead.nextFollowUpDate)}</strong>
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateQuoteFromLead(lead);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-md transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="Generate Smart Quote Takeoff from this enquiry"
                        >
                          <Sparkles className="w-3 h-3 text-sky-600" />
                          <span>Smart Quote →</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {stageLeads.length === 0 && (
                    <div className="h-32 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl text-center p-3 text-xs text-slate-400">
                      <span>No enquiries in this stage</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Architect / Builder</th>
                  <th className="py-3 px-4">Project Address</th>
                  <th className="py-3 px-4">Profile & Area</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4 text-right">Est. Value</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {lead.clientName}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      {lead.companyOrArchitect || 'Direct'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                      {lead.projectAddress}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">{lead.profilePreferred}</div>
                      <div className="text-[10px] text-slate-400 font-mono tabular-nums">{lead.roofAreaM2} m² · {lead.windZone} Wind</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="capitalize text-slate-700 font-medium">
                        {lead.stage.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatNZD(lead.estimatedValueNZD)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateQuoteFromLead(lead);
                        }}
                        className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-semibold rounded-md text-[11px] cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                        title="Generate Smart Quote Takeoff from this enquiry"
                      >
                        <Sparkles className="w-3 h-3 text-sky-600" />
                        <span>Smart Quote →</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. SELECTED LEAD DETAILS DRAWER                               */}
      {/* ------------------------------------------------------------- */}
      {selectedLead && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-2xs flex justify-end animate-in fade-in duration-150"
          onClick={() => setSelectedLead(null)}
        >
          <div 
            className="w-full max-w-lg bg-white h-full shadow-xl flex flex-col overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-start justify-between sticky top-0 bg-white z-10">
              <div>
                <span className="text-xs font-mono text-slate-400 uppercase">
                  Lead Details · {selectedLead.region}
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                  {selectedLead.clientName}
                </h2>
                <p className="text-xs text-slate-500">{selectedLead.projectAddress}</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-5 space-y-5 flex-1 text-xs">
              {/* Primary Action Zone */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Pipeline Stage:</span>
                  <span className="font-mono font-bold capitalize text-slate-900">
                    {selectedLead.stage.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onCreateQuoteFromLead(selectedLead)}
                    className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-sky-400" />
                    <span>Create Quote from Lead</span>
                  </button>
                  <button
                    onClick={() => handleStageAdvance(selectedLead)}
                    className="py-2 px-3 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Advance Stage</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Scope & Specifications */}
              <div>
                <h3 className="font-semibold text-slate-900 uppercase tracking-wider text-[11px] mb-2.5">
                  Scope & Architectural Specification
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Architect / Builder</span>
                    <span className="font-semibold text-slate-900 mt-0.5 block">
                      {selectedLead.companyOrArchitect || 'Direct Client'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Estimated Value</span>
                    <span className="font-bold font-mono text-slate-900 mt-0.5 block tabular-nums">
                      {formatNZD(selectedLead.estimatedValueNZD)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Profile Preferred</span>
                    <span className="font-semibold text-slate-900 mt-0.5 block">
                      {selectedLead.profilePreferred}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Material / Substrate</span>
                    <span className="font-semibold text-slate-900 mt-0.5 block">
                      {selectedLead.materialPreferred}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Roof Area & Pitch</span>
                    <span className="font-mono font-semibold text-slate-900 mt-0.5 block tabular-nums">
                      {selectedLead.roofAreaM2} m² @ {selectedLead.pitchDegrees}°
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px]">Wind & Exposure Zone</span>
                    <span className="font-semibold text-slate-900 mt-0.5 block">
                      {selectedLead.windZone} · {selectedLead.exposureZone}
                    </span>
                  </div>
                </div>
              </div>

              {/* Client Contact Quick Links */}
              <div>
                <h3 className="font-semibold text-slate-900 uppercase tracking-wider text-[11px] mb-2.5">
                  Contact Information
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-700">{selectedLead.email}</span>
                    </div>
                    <a 
                      href={`mailto:${selectedLead.email}`} 
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Send Email
                    </a>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono text-slate-700">{selectedLead.phone}</span>
                    </div>
                    <a 
                      href={`tel:${selectedLead.phone}`} 
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Call
                    </a>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-slate-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Next Follow-up Due:</span>
                    </div>
                    <strong className="font-semibold text-slate-900">{formatDate(selectedLead.nextFollowUpDate)}</strong>
                  </div>
                </div>
              </div>

              {/* Notes Timeline & Quick Entry */}
              <div className="space-y-2.5">
                <h3 className="font-semibold text-slate-900 uppercase tracking-wider text-[11px]">
                  Notes & Timeline
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedLead.notes.map((note, index) => (
                    <div key={index} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 text-xs">
                      {note}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                    placeholder="Add an internal note or site update..."
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNoteText.trim()}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. STREAMLINED NEW LEAD MODAL                                 */}
      {/* ------------------------------------------------------------- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full shadow-xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">New Architectural Enquiry</h2>
                <p className="text-xs text-slate-500">Log a new client lead, architectural scope, and contact details.</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLeadSubmit} className="p-5 space-y-4 text-xs">
              {/* Fieldset 1: Client & Contact */}
              <div className="space-y-2">
                <span className="font-semibold text-slate-900 uppercase tracking-wider text-[10px] block">
                  1. Client & Contact
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Client Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Henderson"
                      value={newLeadForm.clientName}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, clientName: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Architect / Company</label>
                    <input
                      type="text"
                      placeholder="e.g. Fearon Hay Architects"
                      value={newLeadForm.companyOrArchitect}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, companyOrArchitect: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+64 21 000 0000"
                      value={newLeadForm.phone}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="client@domain.co.nz"
                      value={newLeadForm.email}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Fieldset 2: Project Location */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-900 uppercase tracking-wider text-[10px] block">
                  2. Project Location
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label className="block text-slate-600 font-medium mb-1">Site Address *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 42 Omaha Drive, Omaha Beach"
                      value={newLeadForm.projectAddress}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, projectAddress: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Region</label>
                    <select
                      value={newLeadForm.region}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, region: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none cursor-pointer"
                    >
                      <option value="Auckland">Auckland</option>
                      <option value="Wanaka">Wanaka</option>
                      <option value="Waiheke">Waiheke</option>
                      <option value="Omaha">Omaha / Matakana</option>
                      <option value="Queenstown">Queenstown</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Fieldset 3: Scope & Budget */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-900 uppercase tracking-wider text-[10px] block">
                  3. Specification & Budget
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Profile Preferred</label>
                    <select
                      value={newLeadForm.profilePreferred}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, profilePreferred: e.target.value as any })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none cursor-pointer"
                    >
                      <option value="Archtech Super Seam 38mm">Super Seam 38mm</option>
                      <option value="Archtech Angle Seam">Angle Seam</option>
                      <option value="Archtech Double Angle Seam">Double Angle Seam</option>
                      <option value="Archtech Interlocking Panels">Interlocking Panels</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Roof Area (m²)</label>
                    <input
                      type="number"
                      value={newLeadForm.roofAreaM2}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, roofAreaM2: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-600 font-medium mb-1">Estimated Contract Value (NZD)</label>
                    <input
                      type="number"
                      step="5000"
                      value={newLeadForm.estimatedValueNZD}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, estimatedValueNZD: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Save Enquiry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
