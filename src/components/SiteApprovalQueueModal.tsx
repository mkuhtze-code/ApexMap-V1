import React, { useState } from 'react';
import { 
  Project, 
  SiteProgressUpdateSubmission, 
  ProjectProgressNote, 
  SitePhoto 
} from '../types/crm';
import { formatDate } from '../utils/formatters';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ShieldCheck, 
  Edit3, 
  Camera, 
  Check, 
  X, 
  AlertTriangle, 
  Calendar, 
  TrendingUp, 
  Layers,
  ArrowRight
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onUpdateProject: (updated: Project) => void;
  activeProjectId?: string;
  reviewerName?: string;
}

export const SiteApprovalQueueModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projects,
  onUpdateProject,
  activeProjectId,
  reviewerName = 'Marcus Kuhtze (Project Manager)'
}) => {
  const [filterProject, setFilterProject] = useState<string>(activeProjectId || 'all');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // "Edit then Publish" modal state
  const [editingSubmission, setEditingSubmission] = useState<{
    submission: SiteProgressUpdateSubmission;
    project: Project;
  } | null>(null);

  const [editNotes, setEditNotes] = useState('');
  const [editPercent, setEditPercent] = useState<number>(0);
  const [editSelectedPhotos, setEditSelectedPhotos] = useState<string[]>([]);
  const [editDeliveryDate, setEditDeliveryDate] = useState('');
  const [editInstallDate, setEditInstallDate] = useState('');
  const [editCompletionDate, setEditCompletionDate] = useState('');

  // Rejection modal state
  const [rejectingSubmission, setRejectingSubmission] = useState<{
    submission: SiteProgressUpdateSubmission;
    project: Project;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (!isOpen) return null;

  // Aggregate all submissions across projects
  const allSubmissions: { submission: SiteProgressUpdateSubmission; project: Project }[] = [];
  projects.forEach(p => {
    (p.siteUpdateSubmissions || []).forEach(sub => {
      if (filterProject === 'all' || filterProject === p.id) {
        allSubmissions.push({ submission: sub, project: p });
      }
    });
  });

  // Sort descending by submission time
  allSubmissions.sort((a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime());

  const pendingList = allSubmissions.filter(item => item.submission.approvalStatus === 'pending');
  const approvedList = allSubmissions.filter(item => item.submission.approvalStatus === 'approved');
  const rejectedList = allSubmissions.filter(item => item.submission.approvalStatus === 'rejected');

  const displayedList = activeTab === 'pending' ? pendingList : activeTab === 'approved' ? approvedList : rejectedList;

  // Handlers
  const handleApproveDirect = (submission: SiteProgressUpdateSubmission, targetProject: Project) => {
    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];

    // 1. Mark submission approved
    const updatedSubmissions = (targetProject.siteUpdateSubmissions || []).map(s => {
      if (s.id === submission.id) {
        return {
          ...s,
          approvalStatus: 'approved' as const,
          reviewedBy: reviewerName,
          reviewedAt: nowIso,
          publishedToClient: true,
          reviewNotes: 'Approved directly by Project Manager'
        };
      }
      return s;
    });

    // 2. Prepare new public client note if note exists
    const newPublicNotes: ProjectProgressNote[] = [...(targetProject.publicProgressNotes || [])];
    if (submission.notes?.trim()) {
      newPublicNotes.unshift({
        id: `note-${Date.now()}`,
        date: today,
        author: reviewerName,
        title: `Site Progress Update (${submission.proposedProgressPercent || targetProject.progressPercent}%)`,
        note: submission.notes.trim(),
        isPublicToClient: true,
        photoUrl: submission.photoUrls?.[0]
      });
    }

    // 3. Promote approved site photos to client photos
    const newPhotos: SitePhoto[] = [...(targetProject.photos || [])];
    (submission.photoUrls || []).forEach((url, i) => {
      newPhotos.unshift({
        id: `photo-${Date.now()}-${i}`,
        url,
        caption: submission.notes ? `${submission.notes.slice(0, 60)}...` : 'Verified on-site progress inspection',
        phase: targetProject.jobStage || 'active_onsite',
        takenAt: today,
        uploadedBy: submission.submittedBy
      });
    });

    // 4. Update project progress %, status, and dates if proposed
    const updatedProject: Project = {
      ...targetProject,
      siteUpdateSubmissions: updatedSubmissions,
      publicProgressNotes: newPublicNotes,
      photos: newPhotos,
      progressPercent: submission.proposedProgressPercent !== undefined ? submission.proposedProgressPercent : targetProject.progressPercent,
      status: submission.proposedStatus || targetProject.status,
      deliveryDate: submission.proposedDeliveryDate || targetProject.deliveryDate,
      installStartDate: submission.proposedInstallStartDate || targetProject.installStartDate,
      estimatedCompletionDate: submission.proposedEstimatedCompletionDate || targetProject.estimatedCompletionDate,
      targetCompletionDate: submission.proposedEstimatedCompletionDate || targetProject.targetCompletionDate
    };

    onUpdateProject(updatedProject);
  };

  const handleOpenEditPublish = (submission: SiteProgressUpdateSubmission, targetProject: Project) => {
    setEditingSubmission({ submission, project: targetProject });
    setEditNotes(submission.notes || '');
    setEditPercent(submission.proposedProgressPercent !== undefined ? submission.proposedProgressPercent : targetProject.progressPercent);
    setEditSelectedPhotos(submission.photoUrls || []);
    setEditDeliveryDate(submission.proposedDeliveryDate || targetProject.deliveryDate || '');
    setEditInstallDate(submission.proposedInstallStartDate || targetProject.installStartDate || '');
    setEditCompletionDate(submission.proposedEstimatedCompletionDate || targetProject.estimatedCompletionDate || '');
  };

  const handleConfirmEditPublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubmission) return;

    const { submission, project: targetProject } = editingSubmission;
    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];

    const updatedSubmissions = (targetProject.siteUpdateSubmissions || []).map(s => {
      if (s.id === submission.id) {
        return {
          ...s,
          approvalStatus: 'approved' as const,
          reviewedBy: reviewerName,
          reviewedAt: nowIso,
          publishedToClient: true,
          reviewNotes: 'Edited and published by Project Manager',
          editedNotes: editNotes.trim(),
          approvedPhotoUrls: editSelectedPhotos,
          approvedProgressPercent: editPercent,
          approvedDeliveryDate: editDeliveryDate || undefined,
          approvedInstallStartDate: editInstallDate || undefined,
          approvedEstimatedCompletionDate: editCompletionDate || undefined
        };
      }
      return s;
    });

    const newPublicNotes: ProjectProgressNote[] = [...(targetProject.publicProgressNotes || [])];
    if (editNotes.trim()) {
      newPublicNotes.unshift({
        id: `note-${Date.now()}`,
        date: today,
        author: reviewerName,
        title: `Site Progress Update (${editPercent}%)`,
        note: editNotes.trim(),
        isPublicToClient: true,
        photoUrl: editSelectedPhotos[0]
      });
    }

    const newPhotos: SitePhoto[] = [...(targetProject.photos || [])];
    editSelectedPhotos.forEach((url, i) => {
      newPhotos.unshift({
        id: `photo-${Date.now()}-${i}`,
        url,
        caption: editNotes ? `${editNotes.slice(0, 60)}...` : 'Verified on-site progress',
        phase: targetProject.jobStage || 'active_onsite',
        takenAt: today,
        uploadedBy: reviewerName
      });
    });

    const updatedProject: Project = {
      ...targetProject,
      siteUpdateSubmissions: updatedSubmissions,
      publicProgressNotes: newPublicNotes,
      photos: newPhotos,
      progressPercent: editPercent,
      deliveryDate: editDeliveryDate || targetProject.deliveryDate,
      installStartDate: editInstallDate || targetProject.installStartDate,
      estimatedCompletionDate: editCompletionDate || targetProject.estimatedCompletionDate,
      targetCompletionDate: editCompletionDate || targetProject.targetCompletionDate
    };

    onUpdateProject(updatedProject);
    setEditingSubmission(null);
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingSubmission) return;

    const { submission, project: targetProject } = rejectingSubmission;
    const nowIso = new Date().toISOString();

    const updatedSubmissions = (targetProject.siteUpdateSubmissions || []).map(s => {
      if (s.id === submission.id) {
        return {
          ...s,
          approvalStatus: 'rejected' as const,
          reviewedBy: reviewerName,
          reviewedAt: nowIso,
          publishedToClient: false,
          reviewNotes: rejectReason.trim() || 'Declined by Project Manager (Internal note only)'
        };
      }
      return s;
    });

    const updatedProject: Project = {
      ...targetProject,
      siteUpdateSubmissions: updatedSubmissions
    };

    onUpdateProject(updatedProject);
    setRejectingSubmission(null);
    setRejectReason('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Site Progress Update Approval Gate</h2>
              <p className="text-xs text-slate-400">
                Site staff records are internal only. Client portal updates require Project Manager approval.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Pending Review ({pendingList.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('approved')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'approved'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Approved &amp; Published ({approvedList.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('rejected')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'rejected'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Rejected ({rejectedList.length})</span>
            </button>
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Project:</span>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.projectNumber} - {p.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {displayedList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">No {activeTab} site updates</h3>
              <p className="text-xs text-slate-500 mt-1">
                {activeTab === 'pending'
                  ? 'All site staff submissions have been reviewed and resolved.'
                  : `No site update submissions currently marked as ${activeTab}.`}
              </p>
            </div>
          ) : (
            displayedList.map(({ submission, project: targetProject }) => {
              const isPending = submission.approvalStatus === 'pending';
              const isApproved = submission.approvalStatus === 'approved';
              const isRejected = submission.approvalStatus === 'rejected';

              return (
                <div
                  key={submission.id}
                  className={`p-5 rounded-2xl border transition-all space-y-4 ${
                    isPending
                      ? 'bg-amber-50/30 border-amber-200/80 shadow-2xs'
                      : isApproved
                      ? 'bg-white border-slate-200'
                      : 'bg-rose-50/20 border-rose-200'
                  }`}
                >
                  {/* Top line metadata */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {targetProject.projectNumber}
                      </span>
                      <span className="font-bold text-slate-800">{targetProject.title}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">By {submission.submittedBy}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-400">{formatDate(submission.submittedAt)}</span>
                    </div>

                    <div>
                      <span className={`text-[10px] font-bold uppercase font-mono px-2.5 py-0.5 rounded-full ${
                        isPending
                          ? 'bg-amber-100 text-amber-900'
                          : isApproved
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-rose-100 text-rose-900'
                      }`}>
                        {isPending ? 'Pending PM Review' : isApproved ? 'Published to Client' : 'Rejected'}
                      </span>
                    </div>
                  </div>

                  {/* Submission Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    {/* Notes */}
                    <div className="md:col-span-2 space-y-1.5">
                      <span className="font-bold text-slate-500 uppercase text-[10px]">Site Staff Progress Notes:</span>
                      <p className="text-slate-800 bg-white p-3 rounded-xl border border-slate-200 leading-relaxed">
                        {submission.notes || 'No verbal notes provided with this site update.'}
                      </p>

                      {submission.editedNotes && (
                        <div className="mt-2 p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900">
                          <span className="font-bold text-[10px] block uppercase">PM Edited Version (Published):</span>
                          <p className="mt-0.5">{submission.editedNotes}</p>
                        </div>
                      )}
                    </div>

                    {/* Proposed Metrics */}
                    <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <span className="font-bold text-slate-400 uppercase text-[10px] block">Proposed Completion</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <TrendingUp className="w-4 h-4 text-amber-600" />
                          <span className="text-base font-bold font-mono text-slate-900">
                            {submission.proposedProgressPercent !== undefined ? `${submission.proposedProgressPercent}%` : `${targetProject.progressPercent}%`}
                          </span>
                          <span className="text-[11px] text-slate-400 font-sans">
                            (Current: {targetProject.progressPercent}%)
                          </span>
                        </div>
                      </div>

                      {submission.proposedStatus && (
                        <div>
                          <span className="font-bold text-slate-400 uppercase text-[10px] block">Proposed Job Stage</span>
                          <span className="font-bold text-slate-800 capitalize">
                            {submission.proposedStatus.replace('_', ' ')}
                          </span>
                        </div>
                      )}

                      {submission.proposedDeliveryDate && (
                        <div>
                          <span className="font-bold text-slate-400 uppercase text-[10px] block">Delivery Date</span>
                          <span className="font-mono text-slate-800">{formatDate(submission.proposedDeliveryDate)}</span>
                        </div>
                      )}

                      {submission.proposedEstimatedCompletionDate && (
                        <div>
                          <span className="font-bold text-slate-400 uppercase text-[10px] block">Estimated Completion</span>
                          <span className="font-mono text-amber-800 font-bold">{formatDate(submission.proposedEstimatedCompletionDate)}</span>
                          <span className="text-[10px] text-slate-500 block">Sensitive - PM approval required</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Photos */}
                  {submission.photoUrls && submission.photoUrls.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-bold text-slate-500 uppercase text-[10px]">
                        Attached On-Site Photos ({submission.photoUrls.length}):
                      </span>
                      <div className="flex flex-wrap gap-2.5">
                        {submission.photoUrls.map((url, idx) => (
                          <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 w-24 h-24 bg-slate-100">
                            <img src={url} alt="Site progress" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review Audit / Actions */}
                  {isPending ? (
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                        <span>Client will not see this until you approve or edit.</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRejectingSubmission({ submission, project: targetProject })}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleOpenEditPublish(submission, targetProject)}
                          className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit then Publish</span>
                        </button>
                        <button
                          onClick={() => handleApproveDirect(submission, targetProject)}
                          className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve &amp; Publish</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Reviewed by: {submission.reviewedBy || 'Marcus Kuhtze'}</span>
                      <span>Review: {submission.reviewNotes || 'Actioned'}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>High-Trust Quality Assurance: All client-facing updates undergo verified gatekeeping.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close Approval Queue
          </button>
        </div>
      </div>

      {/* "Edit then Publish" Modal */}
      {editingSubmission && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-600" />
                <span>Refine &amp; Publish to Client Portal</span>
              </h3>
              <button
                onClick={() => setEditingSubmission(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditPublish} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Client-Facing Progress Note (remove jargon, refine tone):
                </label>
                <textarea
                  rows={4}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 font-sans"
                  placeholder="Standing seam trays completed on North Gable. Underlay inspected and compliant..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Approved Progress %:</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editPercent}
                    onChange={(e) => setEditPercent(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border border-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Estimated Completion Date:</label>
                  <input
                    type="date"
                    value={editCompletionDate}
                    onChange={(e) => setEditCompletionDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                Note: Client portal visibility controls also apply. If "Estimated Completion Date" toggle is disabled on the project, the date remains hidden until deliberately switched on.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSubmission(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Publish to Client Portal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingSubmission && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Reject Site Update Submission</span>
            </h3>

            <p className="text-xs text-slate-500">
              This update will not be published to the client portal and will be logged internally with your reason.
            </p>

            <form onSubmit={handleConfirmReject} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason for Rejection:</label>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g. Internal note only; photo does not meet client presentation standards; date requires supplier confirmation."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectingSubmission(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold shadow-xs cursor-pointer"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
