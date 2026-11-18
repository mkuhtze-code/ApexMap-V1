import React from 'react';
import { GroupedCutListItem, SectionEngineStats } from '../../types/sections';
import { X, Download, Printer, CheckCircle2, FileSpreadsheet, Scissors, Layers } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cutList: GroupedCutListItem[];
  stats: SectionEngineStats;
  projectName?: string;
}

export const SectionCutListDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  cutList,
  stats,
  projectName = 'Residential Roofing Project'
}) => {
  if (!isOpen) return null;

  const handleExportCsv = () => {
    const headers = [
      'Section Code',
      'Section Description',
      'Ordered Length (m)',
      'Sheets Ordered (Blanks)',
      'Pieces on Roof',
      'Reused from Offcuts',
      'Offcuts Harvested',
      'Workflow Instructions'
    ];

    const rows = cutList.map((item) => [
      item.sectionCode,
      `"${item.sectionLabel}"`,
      item.orderLengthM.toFixed(3),
      item.sheetCountOrdered,
      item.piecesOnRoof,
      item.reusedFromOffcuts,
      item.offcutsHarvested,
      `"${item.notes}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ApexMap_Grouped_CutList_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white w-full sm:max-w-2xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Roll-Former Order Schedule (Grouped)
              </h3>
              <p className="text-xs text-slate-400">
                {projectName} · Sections grouped for coil optimization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 font-bold transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800/80 grid grid-cols-4 gap-2 text-center text-xs">
          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Ordered Sheets</span>
            <span className="text-base font-extrabold font-mono text-white">{stats.totalSheetsOrdered}</span>
          </div>
          <div className="bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/50">
            <span className="text-[10px] text-emerald-400 uppercase font-bold block">Steel Saved</span>
            <span className="text-base font-extrabold font-mono text-emerald-400">+{stats.metresSaved} m</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Utilisation</span>
            <span className="text-base font-extrabold font-mono text-sky-400">{stats.utilisationPercent}%</span>
          </div>
          <div className="bg-amber-950/40 p-2.5 rounded-xl border border-amber-800/50">
            <span className="text-[10px] text-amber-400 uppercase font-bold block">Cost Recovery</span>
            <span className="text-base font-extrabold font-mono text-amber-400">${stats.estimatedValueNZD}</span>
          </div>
        </div>

        {/* Grouped Table */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1 text-xs">
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/30">
            <table className="w-full text-left">
              <thead className="bg-slate-800/70 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Section</th>
                  <th className="py-2.5 px-3">Order Blank</th>
                  <th className="py-2.5 px-3 text-center">Sheets</th>
                  <th className="py-2.5 px-3 text-center">Offcut Source</th>
                  <th className="py-2.5 px-3">Crew Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {cutList.map((item) => (
                  <tr key={item.sectionId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: item.sectionColor }}
                        />
                        <span className="font-bold text-white font-sans text-xs">
                          {item.sectionLabel}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sky-400 font-bold">
                      {item.orderLengthM > 0 ? `${item.orderLengthM.toFixed(3)} m` : 'Offcut (0m)'}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-white">
                      {item.sheetCountOrdered > 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {item.sheetCountOrdered}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-sans text-[11px]">
                      {item.reusedFromOffcuts > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                          +{item.reusedFromOffcuts} reused
                        </span>
                      ) : (
                        <span className="text-slate-500">Mill direct</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-sans text-[11px] text-slate-300">
                      {item.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
            ℹ️ <strong className="text-white">Trade Rule:</strong> Sections are the primary unit for the crew. Order quantities reflect full coil blanks with zero surplus ordered for receiving hip zones.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
