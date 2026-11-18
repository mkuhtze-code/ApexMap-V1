import React, { useState } from 'react';
import { Project, SiteProgressUpdateSubmission, SitePhoto, ActivityLogItem } from '../types/crm';
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Camera, 
  FileText, 
  Edit3, 
  X, 
  AlertTriangle, 
  ChevronRight, 
  Check, 
  Lock, 
  Eye, 
  EyeOff,
  UserCheck
} from 'lucide-react';
import { formatDate } from '../utils/formatters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onUpdateProject: (updatedProject: Project) => void;
  activeProjectId?: string;
  reviewerName?: string;
}

export const ApprovalGateModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projects,
  onUpdateProject,
  activeProjectId,
  reviewerName = 'Marcus Kuhtze (Project Manager)'
}) => {
  const [selectedFilterProjectId, setSelectedFilterProjectId] = useState<string>(activeProjectId || 'all');
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  if (!isOpen) return null;

  // Flatten submissions across projects
  const allSubmissions = projects.flatMap(p => 
    (p.siteUpdateSubmissions || []).map((s: any) => ({ ...s, project: p }))
  );

  const filteredSubmissions = allSubmissions.filter(s => {
    if (selectedFilterProjectId !== 'all' && s.projectId !== selectedFilterProjectId) {
      return false;
    }
    return activeTab === 'pending' 
      ? s.status === 'pending_pm_review' 
      : (s.status === 'approved_published' || s.status === 'approved_edited' || s.status === 'rejected');
  });

  const pendingCount = allSubmissions.filter(s => s.status === 'pending_pm_review').length;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleApproveAndPublish = (
    submission: any,
    customTitle?: string,
    customNotes?: string
  ) => {
    const proj = submission.project;
    const nowIso = new Date().toISOString();
    const finalTitle = customTitle || submission.title;
    const finalNotes = customNotes || submission.internalNotes;

    // 1. Update the submission item
    const updatedSubmissions = ((proj.siteUpdateSubmissions || []) as any[]).map(s => {
      if (s.id === submission.id) {
        return {
          ...s,
          approvalStatus: (customTitle || customNotes) ? ('approved' as const) : ('approved' as const),
          reviewedBy: reviewerName,
          reviewedAt: nowIso,
          clientFacingTitle: finalTitle,
          clientFacingNotes: finalNotes,
          publishedToClientPortal: true
        };
      }
      return s;
    });

    // 2. If it has a photo, add to project.photos
    let updatedPhotos = [...(proj.photos || [])];
    if (submission.photoUrl) {
      const newPhoto: SitePhoto = {
        id: `p-${Date.now()}`,
        url: submission.photoUrl,
        caption: finalTitle,
        phase: submission.photoPhase || 'Site Progress',
        takenAt: submission.submittedAt ? submission.submittedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        uploadedBy: submission.author || reviewerName
      };
      updatedPhotos = [newPhoto, ...updatedPhotos];
    }

    // 3. Update milestones if suggested
    let updatedMilestones = [...(proj.milestones || [])];
    if (submission.suggestedMilestoneId) {
      updatedMilestones = updatedMilestones.map(m => {
        if (m.id === submission.suggestedMilestoneId) {
          return {
            ...m,
            completed: true,
            completedAt: nowIso.slice(0, 10),
            inspectorName: reviewerName
          };
        }
        return m;
      });
    }

    // 4. Update percent complete if suggested and higher
    let updatedPercent = proj.progressPercent;
    if (submission.suggestedPercentComplete && submission.suggestedPercentComplete > proj.progressPercent) {
      updatedPercent = submission.suggestedPercentComplete;
    }

    // 5. Activity feed entry
    const activityItem: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: proj.id,
      entityType: 'project',
      type: 'milestone',
      title: `PM Approved & Published: ${finalTitle}`,
      details: `${reviewerName} approved site submission from ${submission.author} (${submission.authorRole}). Published to client portal.`,
      author: reviewerName,
      timestamp: nowIso.replace('T', ' ').slice(0, 16)
    };

    const updatedProj: Project = {
      ...proj,
      siteUpdateSubmissions: updatedSubmissions,
      photos: updatedPhotos,
      milestones: updatedMilestones,
      progressPercent: updatedPercent,
      activityFeed: [activityItem, ...(proj.activityFeed || [])]
    };

    onUpdateProject(updatedProj);
    setEditingSubmissionId(null);
    showToast(`Approved & published to client portal: "${finalTitle}"`);
  };

  const handleRejectSubmission = (
    submission: any
  ) => {
    const proj = submission.project;
    const nowIso = new Date().toISOString();

    const updatedSubmissions = ((proj.siteUpdateSubmissions || []) as any[]).map(s => {
      if (s.id === submission.id) {
        return {
          ...s,
          approvalStatus: 'rejected' as const,
          reviewedBy: reviewerName,
          reviewedAt: nowIso,
          publishedToClientPortal: false,
          reviewNotes: 'Internal record only — not appropriate for client portal publication.'
        };
      }
      return s;
    });

    const activityItem: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: proj.id,
      entityType: 'project',
      type: 'note',
      title: `Submission Marked Internal Only: ${submission.title}`,
      details: `${reviewerName} retained submission from ${submission.author} as internal staff record. Hidden from client.`,
      author: reviewerName,
      timestamp: nowIso.replace('T', ' ').slice(0, 16)
    };

    const updatedProj: Project = {
      ...proj,
      siteUpdateSubmissions: updatedSubmissions,
      activityFeed: [activityItem, ...(proj.activityFeed || [])]
    };

    onUpdateProject(updatedProj);
    showToast(`Marked internal-only (rejected from client portal)`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto font-sans">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between gap-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-500/20 text-amber-300">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold">Site Progress Approval Gate</h2>
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500 text-slate-950">
                  {pendingCount} Pending
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Site staff records remain strictly internal until Project Manager approval. Protect client clarity and trust.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Sub-Nav */}
        <div className="p-3 sm:px-6 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 border border-slate-300/80">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Pending Review ({pendingCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Approval History</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Filter Project:</span>
            <select
              value={selectedFilterProjectId}
              onChange={(e) => setSelectedFilterProjectId(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">All Projects ({projects.length})</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.projectNumber} · {p.title.slice(0, 24)}...
                </option>
              ))}
            </select>
          </div>
        </div>

        {toastMessage && (
          <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {filteredSubmissions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
              <ShieldCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                {activeTab === 'pending' ? 'No pending site submissions awaiting review.' : 'No previous approval records match this filter.'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                When site foremen or installers record updates on site, they queue here for review before publishing.
              </p>
            </div>
          ) : (
            filteredSubmissions.map(sub => {
              const isEditing = editingSubmissionId === sub.id;
              const isApproved = sub.status === 'approved_published' || sub.status === 'approved_edited';
              const isRejected = sub.status === 'rejected';

              return (
                <div
                  key={sub.id}
                  className={`p-5 rounded-2xl border transition-all space-y-3 ${
                    isApproved 
                      ? 'bg-emerald-50/40 border-emerald-200' 
                      : isRejected
                      ? 'bg-rose-50/40 border-rose-200'
                      : 'bg-white border-slate-300 shadow-xs hover:border-slate-400'
                  }`}
                >
                  {/* Card top */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {sub.project.projectNumber}
                      </span>
                      <span className="font-semibold text-slate-700">{sub.project.title}</span>
                      <span>·</span>
                      <span className="text-slate-500">{sub.submittedAt}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                        isApproved
                          ? 'bg-emerald-100 text-emerald-800'
                          : isRejected
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}>
                        {isApproved ? 'Published to Client' : isRejected ? 'Internal Staff Only' : 'Awaiting PM Approval'}
                      </span>
                    </div>
                  </div>

                  {/* Submission Body */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Optional photo preview */}
                    {sub.photoUrl && (
                      <div className="md:col-span-1 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video md:aspect-square relative">
                        <img
                          src={sub.photoUrl}
                          alt={sub.photoCaption || sub.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1 right-1 bg-slate-900/80 text-white text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Camera className="w-3 h-3" />
                          <span>Photo</span>
                        </div>
                      </div>
                    )}

                    <div className={sub.photoUrl ? 'md:col-span-3 space-y-2' : 'md:col-span-4 space-y-2'}>
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                          <span>{sub.author}</span>
                          <span className="text-[10px] text-slate-500 font-mono capitalize">({sub.authorRole.replace('_', ' ')})</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-0.5">{sub.title}</h4>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 font-sans">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Site Internal Notes:
                        </span>
                        <p>{sub.internalNotes}</p>
                      </div>

                      {/* Suggested impacts */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        {sub.suggestedPercentComplete && (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">Suggested Progress:</span>
                            <span className="font-mono font-bold text-slate-900">{sub.suggestedPercentComplete}%</span>
                          </div>
                        )}
                        {sub.suggestedMilestoneId && (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">Milestone:</span>
                            <span className="font-semibold text-slate-900">{sub.suggestedMilestoneId}</span>
                          </div>
                        )}
                      </div>

                      {/* Display Published Text if already approved */}
                      {isApproved && sub.clientFacingTitle && (
                        <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-950">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-800 mb-0.5">
                            <Eye className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Live in Client Portal:</span>
                          </div>
                          <p className="font-semibold">{sub.clientFacingTitle}</p>
                          {sub.clientFacingNotes && <p className="text-[11px] text-emerald-900/80 mt-0.5">{sub.clientFacingNotes}</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline Edit Formulation */}
                  {isEditing && (
                    <div className="p-4 bg-sky-50 rounded-xl border border-sky-200 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sky-950 flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5 text-sky-700" />
                          <span>Edit Client-Facing Wording (Calm Tradie Tone)</span>
                        </span>
                        <button
                          onClick={() => setEditingSubmissionId(null)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Client-Facing Title:</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Client-Facing Note:</label>
                        <textarea
                          rows={2}
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setEditingSubmissionId(null)}
                          className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-lg font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleApproveAndPublish(sub, editTitle, editNotes)}
                          className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve &amp; Publish Edited Update</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions Bar for Pending Submissions */}
                  {sub.status === 'pending_pm_review' && !isEditing && (
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Client portal remains hidden until you approve this item.</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRejectSubmission(sub)}
                          className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-slate-300 hover:border-rose-300 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Keep Internal Only</span>
                        </button>

                        <button
                          onClick={() => {
                            setEditingSubmissionId(sub.id);
                            setEditTitle(sub.title);
                            setEditNotes(sub.internalNotes);
                          }}
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit &amp; Publish</span>
                        </button>

                        <button
                          onClick={() => handleApproveAndPublish(sub)}
                          className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve &amp; Publish</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-slate-400" />
            <span>Reviewing as: <strong className="text-slate-800">{reviewerName}</strong></span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
