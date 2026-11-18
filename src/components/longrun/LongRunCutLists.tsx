import React, { useState, useMemo } from 'react';
import { Project } from '../../types/crm';
import {
  RoofFacet,
  LongRunSheetItem,
  LongRunFlashingItem,
  LongRunProfileKey,
  LONGRUN_PROFILES
} from '../../types/longrun';
import { calculateOffcutStats } from '../../utils/longRunRoofEngine';
import {
  FileSpreadsheet,
  Printer,
  Copy,
  Check,
  CheckCircle2,
  Filter,
  Scissors,
  RotateCw,
  Search,
  ArrowUpDown,
  Share2,
  Layers
} from 'lucide-react';

interface Props {
  project: Project;
  facets: RoofFacet[];
  onUpdateFacets: (facets: RoofFacet[]) => void;
  flashings: LongRunFlashingItem[];
  onUpdateFlashings: (flashings: LongRunFlashingItem[]) => void;
  profileKey: LongRunProfileKey;
  gauge: string;
  colorName: string;
}

export const LongRunCutLists: React.FC<Props> = ({
  project,
  facets,
  onUpdateFacets,
  flashings,
  onUpdateFlashings,
  profileKey,
  gauge,
  colorName
}) => {
  const [activeTab, setActiveTab] = useState<'sheets' | 'flashings'>('sheets');
  const [selectedFacetId, setSelectedFacetId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedNotice, setCopiedNotice] = useState(false);

  const profileDef = LONGRUN_PROFILES[profileKey];
  const stats = calculateOffcutStats(facets);

  // Flatten sheets
  const allSheets = useMemo(() => {
    return facets.flatMap((f) => f.sheets);
  }, [facets]);

  // Filter sheets
  const filteredSheets = useMemo(() => {
    return allSheets.filter((s) => {
      const matchesFacet = selectedFacetId === 'all' || s.facetId === selectedFacetId;
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        s.sheetNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.facetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.offcutDestinationNotes && s.offcutDestinationNotes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.notes && s.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesFacet && matchesStatus && matchesSearch;
    });
  }, [allSheets, selectedFacetId, statusFilter, searchQuery]);

  // Update status of a sheet
  const handleToggleSheetStatus = (sheetId: string) => {
    const sheet = allSheets.find((s) => s.id === sheetId);
    if (!sheet) return;

    const cycle: LongRunSheetItem['status'][] = ['pending', 'measured', 'cut', 'lifted', 'fixed'];
    const nextIdx = (cycle.indexOf(sheet.status) + 1) % cycle.length;
    const nextStatus = cycle[nextIdx];

    const updatedFacets = facets.map((f) => ({
      ...f,
      sheets: f.sheets.map((s) => (s.id === sheetId ? { ...s, status: nextStatus } : s))
    }));
    onUpdateFacets(updatedFacets);
  };

  // Set all filtered to a status
  const handleBulkSetStatus = (status: LongRunSheetItem['status']) => {
    const targetIds = new Set(filteredSheets.map((s) => s.id));
    const updatedFacets = facets.map((f) => ({
      ...f,
      sheets: f.sheets.map((s) => (targetIds.has(s.id) ? { ...s, status } : s))
    }));
    onUpdateFacets(updatedFacets);
  };

  // Copy Cut List text for WhatsApp / SMS / Ground Cutter
  const handleCopyCutList = () => {
    let text = `======================================================================
GROUND CUTTER ROOFING SHEET CUT LIST
Project: ${project.projectNumber} · ${project.title}
Profile: ${profileDef.name} (${colorName}, ${gauge})
Total Sheets: ${allSheets.length} | Offcut Reused: ${stats.offcutsReusedCount}
======================================================================\n\n`;

    facets.forEach((facet) => {
      text += `[${facet.name} · ${facet.pitchDeg}° PITCH]\n`;
      facet.sheets.forEach((s) => {
        text += `  • [${s.sheetNumber}] Cut: ${s.cutLengthMm}mm (Order: ${s.orderLengthMm}mm) | Top: ${s.topCut.toUpperCase()} (${s.topAngleDeg}°) | Bottom: ${s.bottomCut.toUpperCase()}`;
        if (s.isFlippedOffcutPiece) {
          text += `  [★ REUSED FROM OFFCUT: ${s.offcutSourceNotes || 'Flipped 180°'}]`;
        } else if (s.offcutDestinationNotes) {
          text += `  [➔ KEEP OFFCUT: ${s.offcutLengthMm}mm -> ${s.offcutDestinationNotes}]`;
        }
        text += ` | Status: ${s.status.toUpperCase()}\n`;
      });
      text += `\n`;
    });

    navigator.clipboard.writeText(text);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 3000);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Sheet Number',
      'Roof Facet',
      'Pitch (Deg)',
      'Order Length (mm)',
      'Cut Length (mm)',
      'Top Cut Type',
      'Top Angle (Deg)',
      'Bottom Cut Type',
      'Bottom Angle (Deg)',
      'Offcut Length (mm)',
      'Offcut Destination / Source',
      'Status'
    ];

    const rows = allSheets.map((s) => [
      s.sheetNumber,
      `"${s.facetName}"`,
      s.pitchDeg,
      s.orderLengthMm,
      s.cutLengthMm,
      s.topCut,
      s.topAngleDeg,
      s.bottomCut,
      s.bottomAngleDeg,
      s.offcutLengthMm,
      `"${s.isFlippedOffcutPiece ? s.offcutSourceNotes : s.offcutDestinationNotes || ''}"`,
      s.status
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${project.projectNumber}_CutList_Sheets.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Fast Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Scissors className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Ground Cutter &amp; Roofing Cut Lists
              </h3>
              <p className="text-[11px] text-slate-500">
                Rugged field cut sheets with angle rake specifications and offcut destination tags
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyCutList}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {copiedNotice ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedNotice ? 'Cut List Copied!' : 'Copy for Ground Crew'}</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4 Cut Sheet</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher: Roofing Sheets vs Flashings */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('sheets')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'sheets'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Roofing Sheets Cut List ({allSheets.length})
            </button>
            <button
              onClick={() => setActiveTab('flashings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'flashings'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Flashing Cut &amp; Fold List ({flashings.length})
            </button>
          </div>

          {/* Quick Checkoff Progress */}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>
              Fixed On Roof:{' '}
              <strong className="text-emerald-700 font-bold">
                {allSheets.filter((s) => s.status === 'fixed').length} / {allSheets.length}
              </strong>
            </span>
            <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{
                  width: `${(allSheets.filter((s) => s.status === 'fixed').length / Math.max(1, allSheets.length)) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ROOFING SHEETS CUT LIST VIEW */}
      {activeTab === 'sheets' && (
        <div className="space-y-3">
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by sheet (e.g. H-02, V-01)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400"
                />
              </div>

              {/* Facet Filter */}
              <select
                value={selectedFacetId}
                onChange={(e) => setSelectedFacetId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value="all">All Roof Planes</option>
                {facets.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.sheets.length})
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="measured">Measured</option>
                <option value="cut">Cut on Ground</option>
                <option value="lifted">Lifted to Roof</option>
                <option value="fixed">Fixed &amp; Screwed</option>
              </select>
            </div>

            {/* Bulk Status Set Buttons */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Bulk Set:</span>
              <button
                onClick={() => handleBulkSetStatus('cut')}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold"
              >
                All Cut
              </button>
              <button
                onClick={() => handleBulkSetStatus('fixed')}
                className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[10px] font-bold"
              >
                All Fixed
              </button>
            </div>
          </div>

          {/* Cut List Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-white font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3.5">Sheet</th>
                    <th className="py-3 px-3">Roof Plane</th>
                    <th className="py-3 px-3">Pitch</th>
                    <th className="py-3 px-3 text-right">Order Blank</th>
                    <th className="py-3 px-3 text-right">Net Cut Length</th>
                    <th className="py-3 px-3">Top End Angle</th>
                    <th className="py-3 px-3">Bottom End</th>
                    <th className="py-3 px-3.5">Offcut Reuse / Destination</th>
                    <th className="py-3 px-3.5 text-center">Status (Tap to Cycle)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredSheets.map((sheet) => {
                    const isFlipped = sheet.isFlippedOffcutPiece;
                    const hasOffcut = sheet.offcutReused && !isFlipped;

                    return (
                      <tr
                        key={sheet.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          sheet.status === 'fixed'
                            ? 'bg-emerald-50/30'
                            : isFlipped
                            ? 'bg-purple-50/30'
                            : ''
                        }`}
                      >
                        {/* Sheet Mark */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs font-extrabold bg-slate-900 text-white px-2.5 py-1 rounded-md">
                            {sheet.sheetNumber}
                          </span>
                        </td>

                        {/* Facet Name */}
                        <td className="py-3 px-3 text-slate-800 font-semibold whitespace-nowrap">
                          {sheet.facetName}
                        </td>

                        {/* Pitch */}
                        <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {sheet.pitchDeg}°
                        </td>

                        {/* Order Blank */}
                        <td className="py-3 px-3 font-mono text-right text-slate-500 whitespace-nowrap">
                          {isFlipped ? (
                            <span className="text-[10px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                              0mm (Offcut)
                            </span>
                          ) : (
                            `${sheet.orderLengthMm} mm`
                          )}
                        </td>

                        {/* Cut Length */}
                        <td className="py-3 px-3 font-mono font-bold text-right text-slate-900 text-sm whitespace-nowrap">
                          {sheet.cutLengthMm} mm
                        </td>

                        {/* Top End Cut */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {sheet.topCut === 'square' ? (
                            <span className="text-slate-600 font-mono">Square (90°)</span>
                          ) : (
                            <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              {sheet.topCut.replace('_', ' ').toUpperCase()} ({sheet.topAngleDeg}°)
                            </span>
                          )}
                        </td>

                        {/* Bottom End Cut */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {sheet.bottomCut === 'square' ? (
                            <span className="text-slate-600 font-mono">Square +50mm Eaves</span>
                          ) : (
                            <span className="font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                              {sheet.bottomCut.replace('_', ' ').toUpperCase()} ({sheet.bottomAngleDeg}°)
                            </span>
                          )}
                        </td>

                        {/* Offcut Routing Destination */}
                        <td className="py-3 px-3.5">
                          {isFlipped ? (
                            <div className="flex items-center gap-1.5 text-purple-800 font-bold bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg text-[11px]">
                              <RotateCw className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>{sheet.offcutSourceNotes || 'Reused Flipped Offcut'}</span>
                            </div>
                          ) : hasOffcut ? (
                            <div className="flex items-center gap-1.5 text-amber-900 font-bold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-[11px]">
                              <Scissors className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>
                                {sheet.offcutLengthMm}mm Offcut ➔ {sheet.offcutDestinationNotes}
                              </span>
                            </div>
                          ) : sheet.hasDiagonalCut ? (
                            <span className="text-[10px] text-slate-400">Scrap offcut ({sheet.offcutLengthMm}mm)</span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Standard square drop (0mm offcut)</span>
                          )}
                        </td>

                        {/* Checkoff Status Button */}
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleToggleSheetStatus(sheet.id)}
                            className={`px-3 py-1 rounded-xl text-[11px] font-bold capitalize transition-all cursor-pointer ${
                              sheet.status === 'fixed'
                                ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                                : sheet.status === 'lifted'
                                ? 'bg-sky-600 text-white hover:bg-sky-700'
                                : sheet.status === 'cut'
                                ? 'bg-amber-500 text-white hover:bg-amber-600'
                                : sheet.status === 'measured'
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {sheet.status === 'fixed'
                              ? '✓ Fixed'
                              : sheet.status === 'lifted'
                              ? '↑ Lifted'
                              : sheet.status === 'cut'
                              ? '✂ Cut Ground'
                              : sheet.status === 'measured'
                              ? '📏 Measured'
                              : 'Pending'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* FLASHINGS CUT LIST VIEW */}
      {activeTab === 'flashings' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Mark</th>
                  <th className="py-3 px-3">Flashing Description</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3 text-right">Girth</th>
                  <th className="py-3 px-3 text-right">Folded Length</th>
                  <th className="py-3 px-3 text-right">Qty</th>
                  <th className="py-3 px-3">Left End Finish</th>
                  <th className="py-3 px-3">Right End Finish</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {flashings.map((fl) => (
                  <tr key={fl.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3.5 font-mono text-xs font-bold text-slate-900">
                      {fl.mark}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {fl.name}
                      {fl.softEdgeFitted && (
                        <span className="ml-2 text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          Soft-Edge
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{fl.category}</td>
                    <td className="py-3 px-3 font-mono text-right text-slate-800">{fl.girthMm}mm</td>
                    <td className="py-3 px-3 font-mono font-bold text-right text-slate-900">
                      {(fl.standardLengthMm / 1000).toFixed(1)}m
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-right text-slate-900">{fl.quantity} pcs</td>
                    <td className="py-3 px-3 text-slate-700">{fl.leftMitre || 'Square'}</td>
                    <td className="py-3 px-3 text-slate-700">{fl.rightMitre || 'Square'}</td>
                    <td className="py-3 px-3.5 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize ${
                          fl.status === 'installed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : fl.status === 'folded'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {fl.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
