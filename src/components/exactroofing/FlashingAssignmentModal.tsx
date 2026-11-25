import React, { useMemo, useState, useEffect } from 'react';
import { FlashingProfile, Project } from '../../types/crm';
import { AssignableRoofLine, RoofFlashingAssignment } from '../../types/exactRoofing';
import { ProfileThumbnail } from '../FlashingWorkshop';
import {
  extractAssignmentFlashingSpecs,
  findMatchingCategoryRank,
  getDefaultMitreNotes,
  getFlashingKindDisplayLabel
} from '../../utils/exactRoofingFlashingBridge';
import { computeFlashingPieceBreakdown } from '../../utils/exactRoofingEngine';
import { Check, Pencil, PenTool, Search, Trash2, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  line: AssignableRoofLine | null;
  existingAssignment?: RoofFlashingAssignment;
  libraryProfiles: FlashingProfile[];
  project?: Project;
  onClose: () => void;
  onOpenDrawingSuite: (line: AssignableRoofLine, seedProfileId?: string | null) => void;
  onSaveAssignment: (assignment: RoofFlashingAssignment) => void;
  onRemoveAssignment?: (lineId: string) => void;
}

export const FlashingAssignmentModal: React.FC<Props> = ({
  isOpen,
  line,
  existingAssignment,
  libraryProfiles,
  project,
  onClose,
  onOpenDrawingSuite,
  onSaveAssignment,
  onRemoveAssignment
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [stickLengthM, setStickLengthM] = useState<number>(4.0);
  const [quantity, setQuantity] = useState<number>(1);
  const [colorName, setColorName] = useState<string>(project?.colorName || 'FlaxPod');
  const [notes, setNotes] = useState<string>('');

  const sortedProfiles = useMemo(() => {
    if (!line) return libraryProfiles;
    const filtered = libraryProfiles.filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.girthTier || '').toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      const rankDiff =
        findMatchingCategoryRank(a.category, line.suggestedCategory) -
        findMatchingCategoryRank(b.category, line.suggestedCategory);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });
  }, [libraryProfiles, line, searchQuery]);

  // Initialize form whenever line or existing assignment changes
  useEffect(() => {
    if (!isOpen || !line) return;

    if (existingAssignment) {
      setSelectedProfileId(existingAssignment.profileId);
      setStickLengthM(existingAssignment.pieceLengthLm);
      setQuantity(existingAssignment.quantity);
      setColorName(existingAssignment.colorName || project?.colorName || 'FlaxPod');
      setNotes(existingAssignment.notes || getDefaultMitreNotes(line.flashingKind));
    } else {
      const firstBest = sortedProfiles[0];
      setSelectedProfileId(firstBest?.id || '');
      setStickLengthM(line.recommendedPieceLengthM);
      setQuantity(line.recommendedQuantity);
      setColorName(project?.colorName || firstBest?.colorName || 'FlaxPod');
      setNotes(getDefaultMitreNotes(line.flashingKind));
    }
    setSearchQuery('');
  }, [isOpen, line?.lineId]);

  if (!isOpen || !line) return null;

  const selectedProfile =
    libraryProfiles.find((p) => p.id === selectedProfileId) || sortedProfiles[0] || null;
  const totalLinearMetres = +(Math.max(1, quantity) * Math.max(0.2, stickLengthM)).toFixed(2);
  const kindDisplay = getFlashingKindDisplayLabel(line.flashingKind);

  const handleRecalcForStickCap = (maxStickM: number) => {
    const breakdown = computeFlashingPieceBreakdown(
      line.trueSlopeLengthM,
      line.flashingKind,
      maxStickM
    );
    setQuantity(breakdown.recommendedQuantity);
    setStickLengthM(breakdown.recommendedPieceLengthM);
  };

  const handleConfirm = () => {
    if (!selectedProfile) return;
    const specs = extractAssignmentFlashingSpecs(selectedProfile, line.flashingKind);
    const pieceLengthMm = Math.max(100, Math.round(Number(stickLengthM) * 1000));
    const cleanLenLm = +(pieceLengthMm / 1000).toFixed(3);
    const qty = Math.max(1, Math.round(quantity));

    onSaveAssignment({
      id: existingAssignment?.id || `assign-${line.lineId}`,
      lineId: line.lineId,
      lineLabel: line.label,
      flashingKind: line.flashingKind,
      profileId: selectedProfile.id,
      profileName: selectedProfile.name,
      productCode: existingAssignment?.productCode || specs.productCode,
      developedBlankWidthMm: specs.developedBlankWidthMm,
      girthTier: specs.girthTier,
      bendCount: specs.bendCount,
      keyAnglesDeg: specs.keyAnglesDeg,
      hasHemCrush: specs.hasHemCrush,
      material: selectedProfile.material || project?.material || '0.55mm ColorCote Vitor+',
      colorName: colorName.trim() || 'FlaxPod',
      planLengthM: line.planLengthM,
      trueSlopeLengthM: line.trueSlopeLengthM,
      pieceLengthLm: cleanLenLm,
      pieceLengthMm,
      quantity: qty,
      totalLinearMetres: +(qty * cleanLenLm).toFixed(3),
      notes: notes.trim() || undefined,
      source: 'user',
      assignedAt: new Date().toISOString(),
      orderedToWorkshop: false,
      orderedToCrm: false
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-3xl bg-[#0b101d] border border-slate-800 text-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/70 flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
              {kindDisplay}
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
              {line.label}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
              <span>Plan: {line.planLengthM.toFixed(2)} m</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400 font-bold">
                True Slope Run: {line.trueSlopeLengthM.toFixed(2)} m
              </span>
              {line.pitchesDeg.length > 0 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>
                    Pitch: {line.pitchesDeg.map((p) => `${p}°`).join(' / ')}
                  </span>
                </>
              )}
              {line.lapAllowanceM > 0 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>Lap Allow: +{line.lapAllowanceM.toFixed(2)} m</span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer shrink-0"
            aria-label="Close Flashing Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Primary CTA: Launch Flashing Drawing Suite */}
          <div className="p-3.5 rounded-2xl bg-sky-950/40 border border-sky-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-extrabold text-white">
                Need a custom bend profile for {line.label}?
              </div>
              <p className="text-[11px] text-slate-300">
                Sketch legs &amp; hems in the Flashing Drawing Suite and assign directly back to this roof line.
              </p>
            </div>
            <button
              onClick={() => onOpenDrawingSuite(line, null)}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer shrink-0"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Draw New Flashing</span>
            </button>
          </div>

          {/* Search Library Profiles */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Select From Flashing Library ({sortedProfiles.length})
            </div>
            <div className="relative w-48 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search barge, ridge, valley..."
                className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          {/* Profiles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {sortedProfiles.map((profile) => {
              const isSelected = selectedProfile?.id === profile.id;
              const isCategoryMatch =
                findMatchingCategoryRank(profile.category, line.suggestedCategory) === 0;
              const blankMm = Math.round(
                profile.developedBlankWidthMm ||
                  profile.developedLengthMm ||
                  profile.segments.reduce((sum, s) => sum + s.lengthMm, 0)
              );

              return (
                <div
                  key={profile.id}
                  onClick={() => setSelectedProfileId(profile.id)}
                  className={`rounded-2xl border p-2.5 transition-all cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? 'bg-slate-900 border-emerald-500 shadow-lg'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="bg-white rounded-xl overflow-hidden">
                    <ProfileThumbnail profile={profile} />
                  </div>

                  <div className="space-y-1 flex-1">
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="text-xs font-extrabold text-white leading-snug line-clamp-2">
                        {profile.name}
                      </div>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {blankMm}mm blank · {Math.max(0, (profile.segments?.length || 1) - 1)} bends
                      {isCategoryMatch ? ' · Match' : ''}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-500 truncate">
                      {profile.segments.length} legs · {profile.category || 'Custom'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDrawingSuite(line, profile.id);
                      }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800 cursor-pointer shrink-0"
                      title="Customize this profile in Flashing Drawing Suite"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stick Breakdown & Fabrication Spec */}
          {selectedProfile && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-white">
                  Order Cut Spec · {selectedProfile.name}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Auto-split max stick:</span>
                  {[3.0, 4.0, 6.0].map((maxLen) => (
                    <button
                      key={maxLen}
                      type="button"
                      onClick={() => handleRecalcForStickCap(maxLen)}
                      className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] font-mono font-bold text-sky-300 cursor-pointer"
                    >
                      {maxLen.toFixed(0)}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Stick Length (m)
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    max="8.0"
                    step="0.05"
                    value={stickLengthM}
                    onChange={(e) => setStickLengthM(Math.max(0.2, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white outline-none tabular-nums"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Quantity (pcs)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.round(Number(e.target.value))))}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white outline-none tabular-nums"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Colour Finish
                  </label>
                  <input
                    type="text"
                    value={colorName}
                    onChange={(e) => setColorName(e.target.value)}
                    placeholder="e.g. FlaxPod"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-sm font-semibold text-white outline-none"
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Total Order Run
                  </span>
                  <span className="text-sm font-mono font-extrabold text-emerald-400 tabular-nums">
                    {totalLinearMetres.toFixed(2)} lm
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  End Mitres &amp; Fabrication Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. 45° Apex Mitre, Eaves Stop-End..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-2 pb-[calc(0.9rem+env(safe-area-inset-bottom))]">
          {existingAssignment && onRemoveAssignment ? (
            <button
              type="button"
              onClick={() => {
                onRemoveAssignment(line.lineId);
                onClose();
              }}
              className="px-3.5 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-700/50 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Unassign</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedProfile}
              onClick={handleConfirm}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Assign Flashing to {line.label}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
