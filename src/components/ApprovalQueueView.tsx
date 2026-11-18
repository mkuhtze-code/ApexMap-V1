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
  TrendingUp, 
  Calendar,
  AlertCircle
} from 'lucide-react';

interface Props {
  projects: Project[];
  onUpdateProject: (updated: Project) => void;
  onOpenProjectDetails?: (projectId: string) => void;
  reviewerName?: string;
}

export const ApprovalQueueView: React.FC<Props> = ({
  projects,
  onUpdateProject,
  onOpenProjectDetails,
  reviewerName = 'Marcus Kuhtze (Project Manager)'
}) => {
  const [filterProject, setFilterProject] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // "Edit then Publish" modal state
  const [editingSubmission, setEditingSubmission] = useState<{
    submission: SiteProgressUpdateSubmission;
    project: Project;
  } | null>(null);

  const [editNotes, setEditNotes] = useState('');
  const [editPercent, setEditPercent] = useState<number>(0);
  const [editCompletionDate, setEditCompletionDate] = useState('');

  // Rejection modal state
  const [rejectingSubmission, setRejectingSubmission] = useState<{
    submission: SiteProgressUpdateSubmission;
    project: Project;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

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

  const pendingList = allSubmissions.filter(item => item.submission.approvalStatus === 'pending' || (item.submission as any).status === 'pending');
  const approvedList = allSubmissions.filter(item => item.submission.approvalStatus === 'approved' || (item.submission as any).status === 'approved');
  const rejectedList = allSubmissions.filter(item => item.submission.approvalStatus === 'rejected' || (item.submission as any).status === 'rejected');

  const displayedList = activeTab === 'pending' ? pendingList : activeTab === 'approved' ? approvedList : rejectedList;

  // Direct Approval
  const handleApproveDirect = (submission: SiteProgressUpdateSubmission, targetProject: Project) => {
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
          reviewNotes: 'Approved directly by Project Manager'
        };
      }
      return s;
    });

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

  const handleOpenEdit = (submission: SiteProgressUpdateSubmission, targetProject: Project) => {
    setEditingSubmission({ submission, project: targetProject });
    setEditNotes(submission.notes || '');
    setEditPercent(submission.proposedProgressPercent !== undefined ? submission.proposedProgressPercent : targetProject.progressPercent);
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
          editedNotes: editNotes.trim(),
          reviewNotes: 'Edited and published by Project Manager'
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
        photoUrl: submission.photoUrls?.[0]
      });
    }

    const updatedProject: Project = {
      ...targetProject,
      siteUpdateSubmissions: updatedSubmissions,
      publicProgressNotes: newPublicNotes,
      progressPercent: editPercent,
      estimatedCompletionDate: editCompletionDate || targetProject.estimatedCompletionDate
    };

    onUpdateProject(updatedProject);
    setEditingSubmission(null);
  };

  const handleReject = (e: React.FormEvent) => {
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
          reviewNotes: rejectReason.trim() || 'Declined by Project Manager'
        };
      }
      return s;
    });

    onUpdateProject({
      ...targetProject,
      siteUpdateSubmissions: updatedSubmissions
    });

    setRejectingSubmission(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Approval Queue
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Review site progress notes, photos, and completion estimates before publishing to the client portal.
          </p>
        </div>

        {/* Tab & Project Filter */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pending</span>
              {pendingList.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-mono tabular-nums">
                  {pendingList.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'approved'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Published ({approvedList.length})
            </button>
            <button
              onClick={() => setActiveTab('rejected')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'rejected'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rejected ({rejectedList.length})
            </button>
          </div>

          {/* Project Filter */}
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="all">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.projectNumber} — {p.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Submissions List */}
      <div className="space-y-4">
        {displayedList.map(({ submission, project: targetProject }) => {
          const isPending = submission.approvalStatus === 'pending' || (submission as any).status === 'pending';

          return (
            <div
              key={submission.id}
              className={`bg-white rounded-xl border p-5 space-y-4 transition-all shadow-2xs ${
                isPending ? 'border-amber-300 ring-1 ring-amber-400/20' : 'border-slate-200'
              }`}
            >
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                    {targetProject.projectNumber}
                  </span>
                  <span className="font-bold text-slate-900">{targetProject.title}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600">Logged by <strong className="text-slate-900">{submission.submittedBy}</strong></span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-400 font-mono">{formatDate(submission.submittedAt)}</span>
                </div>

                <span className={`text-[11px] font-semibold uppercase font-mono px-2.5 py-0.5 rounded ${
                  isPending
                    ? 'bg-amber-100 text-amber-900'
                    : submission.approvalStatus === 'approved'
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-rose-100 text-rose-900'
                }`}>
                  {isPending ? 'Needs Your Approval' : submission.approvalStatus === 'approved' ? 'Published to Client' : 'Rejected'}
                </span>
              </div>

              {/* Grid: Staff Notes, Photos, Proposed Stage */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
                {/* Notes Column */}
                <div className="md:col-span-2 space-y-2">
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                    Site Notes from Field Crew:
                  </span>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-800 leading-relaxed">
                    {submission.notes || 'No written notes provided with this submission.'}
                  </div>

                  {/* Attached Photos */}
                  {submission.photoUrls && submission.photoUrls.length > 0 && (
                    <div className="pt-2">
                      <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] block mb-1.5">
                        Verification Photos:
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {submission.photoUrls.map((url, i) => (
                          <div key={i} className="w-24 h-24 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 shrink-0">
                            <img src={url} alt="Site" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Proposed Metrics & Actions */}
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div>
                      <span className="font-semibold text-slate-400 uppercase text-[10px] block">
                        Proposed Progress
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <TrendingUp className="w-4 h-4 text-amber-600" />
                        <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                          {submission.proposedProgressPercent ?? targetProject.progressPercent}%
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          (was {targetProject.progressPercent}%)
                        </span>
                      </div>
                    </div>

                    {submission.proposedEstimatedCompletionDate && (
                      <div>
                        <span className="font-semibold text-slate-400 uppercase text-[10px] block">
                          Proposed Target Date
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatDate(submission.proposedEstimatedCompletionDate)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions Zone */}
                  {isPending && (
                    <div className="pt-3 border-t border-slate-200 space-y-1.5">
                      <button
                        onClick={() => handleApproveDirect(submission, targetProject)}
                        className="w-full py-2 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve & Publish to Client</span>
                      </button>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(submission, targetProject)}
                          className="flex-1 py-1.5 px-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Edit3 className="w-3 h-3 text-slate-500" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => setRejectingSubmission({ submission, project: targetProject })}
                          className="flex-1 py-1.5 px-2 text-xs font-medium text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {displayedList.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">
              {activeTab === 'pending' ? 'No pending updates requiring approval' : `No ${activeTab} updates`}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              All field inspections and site progress updates are up to date and approved.
            </p>
          </div>
        )}
      </div>

      {/* Edit Before Publish Modal */}
      {editingSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 shadow-xl space-y-4 text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Edit Site Note before Client Publication
              </h3>
              <button
                onClick={() => setEditingSubmission(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditPublish} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Client-Facing Note *
                </label>
                <textarea
                  rows={4}
                  required
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Progress %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editPercent}
                    onChange={(e) => setEditPercent(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Target Completion Date</label>
                  <input
                    type="date"
                    value={editCompletionDate}
                    onChange={(e) => setEditCompletionDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSubmission(null)}
                  className="px-3.5 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  Save & Publish to Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Submission Modal */}
      {rejectingSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 shadow-xl space-y-4 text-xs animate-in fade-in duration-150">
            <h3 className="text-base font-bold text-slate-900">
              Reject Site Submission
            </h3>
            <p className="text-slate-600">
              Please enter the reason for rejecting this update. Site staff will be notified to resubmit.
            </p>

            <form onSubmit={handleReject} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Rejection Reason</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Please retake photo with clearer lighting on the flashing overlap."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingSubmission(null)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
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
