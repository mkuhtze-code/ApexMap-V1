import React, { useMemo, useState } from 'react';
import { FlashingProfile, Project } from '../../types/crm';
import {
  AssignableRoofLine,
  RoofBomSummary,
  RoofFlashingAssignment
} from '../../types/exactRoofing';
import { ProfileThumbnail } from '../FlashingWorkshop';
import {
  getFlashingKindDisplayLabel,
  groupFlashingScheduleLines
} from '../../utils/exactRoofingFlashingBridge';
import { Check, CheckCircle2, Lock, MapPin, PenTool, Ruler } from 'lucide-react';

interface Props {
  project?: Project;
  assignableLines: AssignableRoofLine[];
  assignments: RoofFlashingAssignment[];
  libraryProfiles: FlashingProfile[];
  bom: RoofBomSummary;
}

export const ContractorFlashingGuide: React.FC<Props> = ({
  project,
  assignableLines,
  assignments,
  libraryProfiles,
  bom
}) => {
  const [installedIds, setInstalledIds] = useState<string[]>([]);

  const toggleInstalled = (id: string) => {
    setInstalledIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const assignmentMap = useMemo(() => {
    const map = new Map<string, RoofFlashingAssignment>();
    assignments.forEach((a) => map.set(a.lineId, a));
    return map;
  }, [assignments]);

  const groupedSchedule = useMemo(
    () => groupFlashingScheduleLines(assignments, libraryProfiles, project?.colorName || 'FlaxPod'),
    [assignments, libraryProfiles, project?.colorName]
  );

  const unassignedKeyLines = useMemo(
    () => assignableLines.filter((l) => !assignmentMap.has(l.lineId) && l.flashingKind !== 'eave'),
    [assignableLines, assignmentMap]
  );

  return (
    <div className="space-y-4 pb-6 font-sans text-white">
      {/* Contractor Field Brief Banner */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
            <span>Contractor Flashing Guide · Read-Only</span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white">
            Flashings Install Schedule ({bom.totalFlashingSticks} Sticks · {bom.totalFlashingLm.toFixed(1)} m)
          </h2>
          <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
            <span>{project?.title || 'Roof Install Project'}</span>
            {project?.siteAddress && (
              <span className="inline-flex items-center gap-1 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-sky-400" />
                {project.siteAddress}
              </span>
            )}
            <span>· Finish: {project?.colorName || 'FlaxPod'}</span>
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-right shrink-0">
          <div className="text-[10px] font-bold uppercase text-slate-400">Progress</div>
          <div className="text-base font-black text-emerald-400 font-mono tabular-nums">
            {installedIds.length} / {assignments.length} Fitted
          </div>
        </div>
      </div>

      {/* Grouped Yard / Stick Order Summary (Read-Only, Zero $) */}
      {groupedSchedule.length > 0 && (
        <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-4 space-y-2.5">
          <div className="text-xs font-extrabold uppercase tracking-wider text-sky-400">
            Grouped Flashing Stick Schedule ({groupedSchedule.length} SKU / Length Groups)
          </div>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Code</th>
                  <th className="py-2 px-3">Profile &amp; Bends</th>
                  <th className="py-2 px-3">Runs Covered</th>
                  <th className="py-2 px-3 text-right">Qty × Length</th>
                  <th className="py-2 px-3 text-right">Total lm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                {groupedSchedule.map((item) => (
                  <tr key={item.groupKey} className="hover:bg-slate-900/50">
                    <td className="py-2 px-3 font-bold text-sky-300 whitespace-nowrap">
                      {item.productCode}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      <div className="font-bold text-white">{item.profileName}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {item.girthMm}mm girth · {item.bendCount} bends
                        {item.hasHemCrush ? ' · Crush/Hem' : ''}
                      </div>
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-300">
                      {item.lineLabels.join(', ')}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-white whitespace-nowrap">
                      {item.quantity} × {item.pieceLengthMm}mm
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                      {item.totalLinearMetres.toFixed(2)} lm
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assigned Flashings Cards (Stranger-Friendly Diagrams + Exact Stick Lengths) */}
      {assignments.length === 0 ? (
        <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-6 text-center space-y-2">
          <PenTool className="w-6 h-6 text-slate-500 mx-auto" />
          <div className="text-sm font-bold text-white">No custom flashing profiles specified yet</div>
          <p className="text-xs text-slate-400">
            Key roof lines and their site lengths are listed below for reference.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {assignments.map((assign) => {
            const matchedProfile = libraryProfiles.find((p) => p.id === assign.profileId);
            const isDone = installedIds.includes(assign.id);
            return (
              <div
                key={assign.id}
                onClick={() => toggleInstalled(assign.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                  isDone
                    ? 'bg-emerald-950/35 border-emerald-500/50'
                    : 'bg-[#101726] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {matchedProfile && (
                      <div className="w-24 shrink-0 bg-white rounded-xl overflow-hidden border border-slate-700">
                        <ProfileThumbnail profile={matchedProfile} />
                      </div>
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                        {getFlashingKindDisplayLabel(assign.flashingKind)}
                      </div>
                      <div className="text-sm font-black text-white truncate">{assign.lineLabel}</div>
                      <div className="text-xs font-semibold text-slate-300 truncate">
                        {assign.profileName}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shrink-0 border ${
                      isDone
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-slate-900 text-slate-300 border-slate-700'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Check className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{isDone ? 'Fitted' : 'Mark Fitted'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">Pieces Needed</div>
                    <div className="font-black text-white">
                      {assign.quantity} × {assign.pieceLengthLm.toFixed(2)}m
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">Total Run</div>
                    <div className="font-black text-emerald-400">
                      {assign.totalLinearMetres.toFixed(1)} lm
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">Blank / Colour</div>
                    <div className="font-bold text-slate-200 truncate">
                      {assign.developedBlankWidthMm || 350}mm · {assign.colorName || 'Match'}
                    </div>
                  </div>
                </div>

                {assign.notes && (
                  <div className="text-[11px] text-slate-300 bg-slate-900/70 rounded-xl px-3 py-2 border border-slate-800/80">
                    <strong className="text-slate-200">Install Note:</strong> {assign.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Structural Line Lengths Reference (read-only) */}
      {unassignedKeyLines.length > 0 && (
        <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-4 space-y-2.5">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5" />
            <span>Additional Roof Edge &amp; Line Measurements</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {unassignedKeyLines.map((line) => (
              <div
                key={line.lineId}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">{line.label}</div>
                  <div className="text-[11px] text-slate-400">
                    {getFlashingKindDisplayLabel(line.flashingKind)} · {line.recommendedQuantity} × {line.recommendedPieceLengthM.toFixed(2)}m
                  </div>
                </div>
                <span className="font-mono font-bold text-sky-400 shrink-0 tabular-nums">
                  {line.trueSlopeLengthM.toFixed(2)} m
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
