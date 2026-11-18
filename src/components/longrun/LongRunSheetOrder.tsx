import React, { useState } from 'react';
import { Project, OnsiteMaterialOrder } from '../../types/crm';
import {
  RoofFacet,
  LongRunProfileKey,
  LONGRUN_PROFILES,
  COLORSTEEL_COLORS,
  LongRunSheetItem
} from '../../types/longrun';
import {
  calculateOffcutStats,
  calculateRoofHardwareRequirements,
  generateSupplierOrderText
} from '../../utils/longRunRoofEngine';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Printer,
  Copy,
  Check,
  Truck,
  Layers,
  Sparkles,
  Info,
  Calendar,
  AlertCircle,
  Scissors,
  CheckCircle2
} from 'lucide-react';

interface Props {
  project: Project;
  facets: RoofFacet[];
  onUpdateFacets: (facets: RoofFacet[]) => void;
  profileKey: LongRunProfileKey;
  onChangeProfileKey: (profile: LongRunProfileKey) => void;
  gauge: '0.40mm' | '0.55mm';
  onChangeGauge: (gauge: '0.40mm' | '0.55mm') => void;
  colorName: string;
  onChangeColorName: (color: string) => void;
  onDispatchOrder: (order: OnsiteMaterialOrder) => void;
}

export const LongRunSheetOrder: React.FC<Props> = ({
  project,
  facets,
  onUpdateFacets,
  profileKey,
  onChangeProfileKey,
  gauge,
  onChangeGauge,
  colorName,
  onChangeColorName,
  onDispatchOrder
}) => {
  const [supplier, setSupplier] = useState<string>('The Roofing Store (Albany)');
  const [deliveryUrgency, setDeliveryUrgency] = useState<
    'Standard Delivery (3-5 Days)' | 'Urgent Roll & Run (48h)' | 'Same-Day Site Delivery'
  >('Urgent Roll & Run (48h)');
  const [requiredDate, setRequiredDate] = useState<string>(
    new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [showManifestModal, setShowManifestModal] = useState(false);

  // New Sheet Modal / Quick Add Form state
  const [targetFacetId, setTargetFacetId] = useState<string>(facets[0]?.id || '');
  const [newSheetLengthMm, setNewSheetLengthMm] = useState<number>(6200);
  const [newSheetCount, setNewSheetCount] = useState<number>(1);
  const [newSheetCutType, setNewSheetCutType] = useState<LongRunSheetItem['topCut']>('square');

  const profileDef = LONGRUN_PROFILES[profileKey];
  const stats = calculateOffcutStats(facets);
  const hardware = calculateRoofHardwareRequirements(facets, profileKey, project.windZone);

  // Group sheets to be rolled from mill (excluding zero-length sheets sourced from offcuts)
  const allOrderedSheets = facets
    .flatMap((f) => f.sheets)
    .filter((s) => !s.isFlippedOffcutPiece && s.orderLengthMm > 0);

  const lengthGroups: Record<number, number> = {};
  allOrderedSheets.forEach((s) => {
    lengthGroups[s.orderLengthMm] = (lengthGroups[s.orderLengthMm] || 0) + 1;
  });

  const sortedLengths = Object.keys(lengthGroups)
    .map(Number)
    .sort((a, b) => b - a);

  const longestSheetMm = Math.max(...sortedLengths, 0);

  // Handle adding sheets
  const handleAddSheets = () => {
    if (newSheetLengthMm <= 0 || newSheetCount <= 0) return;
    const targetFacet = facets.find((f) => f.id === targetFacetId) || facets[0];
    if (!targetFacet) return;

    const newSheets: LongRunSheetItem[] = [];
    const existingCount = targetFacet.sheets.length;

    for (let i = 0; i < newSheetCount; i++) {
      const idx = existingCount + i + 1;
      const prefix = targetFacet.facetType === 'hip_rake' ? 'H' : targetFacet.facetType === 'valley_junction' ? 'V' : 'G';
      newSheets.push({
        id: `sh-custom-${Date.now()}-${i}`,
        sheetNumber: `${prefix}-${idx < 10 ? '0' + idx : idx}`,
        facetId: targetFacet.id,
        facetName: targetFacet.name,
        pitchDeg: targetFacet.pitchDeg,
        orderLengthMm: newSheetLengthMm,
        cutLengthMm: newSheetLengthMm,
        topCut: newSheetCutType,
        topAngleDeg: newSheetCutType.includes('rake') ? 24 : 0,
        bottomCut: 'square',
        bottomAngleDeg: 0,
        effectiveCoverMm: profileDef.coverMm,
        eavesOverhangMm: 50,
        hasDiagonalCut: newSheetCutType !== 'square',
        offcutLengthMm: 0,
        offcutReused: false,
        status: 'pending',
        packNumber: targetFacet.facetType === 'gable' ? 1 : 2
      });
    }

    const updated = facets.map((f) =>
      f.id === targetFacet.id
        ? {
            ...f,
            sheets: [...f.sheets, ...newSheets],
            sheetCount: f.sheets.length + newSheets.length
          }
        : f
    );

    onUpdateFacets(updated);
    setNewSheetCount(1);
  };

  // Handle removing a sheet
  const handleRemoveSheet = (sheetId: string) => {
    const updated = facets.map((f) => ({
      ...f,
      sheets: f.sheets.filter((s) => s.id !== sheetId),
      sheetCount: f.sheets.filter((s) => s.id !== sheetId).length
    }));
    onUpdateFacets(updated);
  };

  // Copy manifest to clipboard
  const handleCopyManifest = () => {
    const text = generateSupplierOrderText(
      project,
      facets,
      [],
      profileKey,
      gauge,
      colorName,
      supplier
    );
    navigator.clipboard.writeText(text);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 3000);
  };

  // Dispatch official order to supplier
  const handleDispatchOfficialOrder = () => {
    const orderNumber = `ROOF-${Math.floor(1000 + Math.random() * 9000)}`;
    const items = [
      {
        id: `item-sh-${Date.now()}`,
        itemDescription: `${profileDef.name} (${colorName}, ${gauge}) - ${stats.totalSheetsOrdered} sheets (${stats.linealMetresOrdered} lm)`,
        category: 'Long-Run Roofing Sheets',
        quantity: stats.totalSheetsOrdered,
        unit: 'sheets',
        urgencyReason: deliveryUrgency
      },
      {
        id: `item-sc-${Date.now()}`,
        itemDescription: `${hardware.screwDescription} (Class 4 / 5 Neo Hex)`,
        category: 'Fasteners & Screws',
        quantity: hardware.screwBoxCount,
        unit: 'boxes (250pc)',
        urgencyReason: 'Matching sheet fixing pack'
      },
      {
        id: `item-un-${Date.now()}`,
        itemDescription: 'Heavy-Duty Self-Supporting Breathable Synthetic Underlay',
        category: 'Underlay',
        quantity: hardware.underlayRolls,
        unit: 'rolls (50m²)',
        urgencyReason: 'Dry-in substrate protection'
      }
    ];

    const newOrder: OnsiteMaterialOrder = {
      id: `ord-sheets-${Date.now()}`,
      orderNumber,
      projectId: project.id,
      projectNumber: project.projectNumber,
      orderedBy: 'Marcus Kuhtze (LBP BP134821)',
      supplier: supplier as any,
      orderDate: new Date().toISOString().slice(0, 10),
      urgency: deliveryUrgency.includes('Same-Day')
        ? 'Urgent Same-Day HIAB'
        : 'Standard Delivery',
      items,
      deliverySiteAddress: project.siteAddress,
      status: 'Sent to The Roofing Store',
      deliveryEta: `${deliveryUrgency} · Req: ${requiredDate}`
    };

    onDispatchOrder(newOrder);
    setShowManifestModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Configuration Header Card: Profile, Gauge, Color, Supplier */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Long-Run Roofing Sheet Order Schedule
              </h3>
              <p className="text-[11px] text-slate-500">
                Direct roll-former cutting schedule with pack staging and offcut deduction
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManifestModal(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Review Order Manifest</span>
            </button>
          </div>
        </div>

        {/* Profile Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            1. Select Long-Run Roofing Profile
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {Object.values(LONGRUN_PROFILES).map((prof) => {
              const active = profileKey === prof.key;
              return (
                <button
                  key={prof.key}
                  onClick={() => onChangeProfileKey(prof.key)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <div className="text-xs font-bold leading-snug">{prof.name}</div>
                  <div className={`text-[10px] mt-1 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                    Cover: <strong className={active ? 'text-white' : 'text-slate-700'}>{prof.coverMm}mm</strong> · Min pitch: {prof.minPitchDeg}°
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gauge & Color Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Steel Gauge */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              2. Steel Base Metal Thickness (Gauge)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChangeGauge('0.40mm')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  gauge === '0.40mm'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="text-xs font-bold">0.40mm BMT (Standard)</div>
                <div className={`text-[10px] ${gauge === '0.40mm' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Standard residential inland long-run
                </div>
              </button>

              <button
                onClick={() => onChangeGauge('0.55mm')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  gauge === '0.55mm'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="text-xs font-bold">0.55mm BMT (Heavy Duty)</div>
                <div className={`text-[10px] ${gauge === '0.55mm' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Required for coastal marine &amp; high wind
                </div>
              </button>
            </div>
          </div>

          {/* Color Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              3. Color Finish ({colorName})
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {COLORSTEEL_COLORS.slice(0, 8).map((col) => {
                const isSelected = colorName === col.name;
                return (
                  <button
                    key={col.name}
                    onClick={() => onChangeColorName(col.name)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: col.hex }}
                    />
                    <span>{col.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Supplier & Delivery Staging */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Roll-former Supplier</label>
            <select
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
            >
              <option value="The Roofing Store (Albany)">The Roofing Store (Albany Branch)</option>
              <option value="The Roofing Store (Highbrook)">The Roofing Store (Highbrook Branch)</option>
              <option value="The Roofing Store (East Tamaki)">The Roofing Store (East Tamaki)</option>
              <option value="The Roofing Store (Hamilton)">The Roofing Store (Hamilton)</option>
              <option value="Dimond Roofing (Penrose)">Dimond Roofing (Penrose)</option>
              <option value="Metalcraft Roofing (Auckland)">Metalcraft Roofing</option>
              <option value="Roofing Industries (Albany)">Roofing Industries</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Production Urgency</label>
            <select
              value={deliveryUrgency}
              onChange={(e) => setDeliveryUrgency(e.target.value as any)}
              className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
            >
              <option value="Urgent Roll & Run (48h)">Urgent Roll &amp; Run (48 Hours)</option>
              <option value="Standard Delivery (3-5 Days)">Standard Delivery (3-5 Days)</option>
              <option value="Same-Day Site Delivery">Same-Day Priority HIAB</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Required Onsite Date</label>
            <input
              type="date"
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
              className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Sheet Schedule Summary & Offcut Deduction Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Total Sheets to Roll</div>
          <div className="text-xl font-mono font-extrabold text-slate-900 mt-0.5">
            {stats.totalSheetsOrdered} <span className="text-xs font-normal text-slate-500">pcs</span>
          </div>
          <div className="text-[10px] text-emerald-600 font-medium">
            +{stats.offcutsReusedCount} sourced from offcuts
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Total Lineal Metres</div>
          <div className="text-xl font-mono font-extrabold text-slate-900 mt-0.5">
            {stats.linealMetresOrdered} <span className="text-xs font-normal text-slate-500">lm</span>
          </div>
          <div className="text-[10px] text-slate-500">
            Net roof cover: ~{(stats.linealMetresInstalled * (profileDef.coverMm / 1000)).toFixed(1)} m²
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase text-slate-400">Max Transport Pack</div>
          <div className="text-xl font-mono font-extrabold text-slate-900 mt-0.5">
            {(longestSheetMm / 1000).toFixed(2)} <span className="text-xs font-normal text-slate-500">m</span>
          </div>
          <div className="text-[10px] text-sky-600 font-medium">HIAB Rig Access OK (&lt;12m)</div>
        </div>

        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase text-emerald-800">Offcut Optimization</div>
          <div className="text-xl font-mono font-extrabold text-emerald-950 mt-0.5">
            -${stats.estimatedDollarSavingsNZD} <span className="text-xs font-normal text-emerald-700">NZD</span>
          </div>
          <div className="text-[10px] text-emerald-700 font-medium">
            {stats.linealMetresSaved} lm steel scrap saved!
          </div>
        </div>
      </div>

      {/* Rollformer Cut Length Grouping Card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Roll-Former Factory Cut Schedule</h4>
            <p className="text-[11px] text-slate-500">Lengths grouped for the coil roll-former machine operator</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyManifest}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {copiedNotice ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedNotice ? 'Copied Schedule!' : 'Copy Cut Schedule'}</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {sortedLengths.map((len) => {
            const count = lengthGroups[len];
            const lm = ((len * count) / 1000).toFixed(2);
            return (
              <div key={len} className="p-3.5 hover:bg-slate-50/70 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-extrabold text-slate-900 bg-slate-100 px-3 py-1 rounded-xl">
                    {count} sheets
                  </span>
                  <div>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {(len / 1000).toFixed(3)} m ({len} mm)
                    </span>
                    <div className="text-[10px] text-slate-500">
                      Standard cut length · {profileDef.name} ({gauge})
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="font-bold text-slate-900">{lm} lm</span>
                  <div className="text-[10px] text-slate-500">~{((Number(lm) * profileDef.coverMm) / 1000).toFixed(1)} m² cover</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Add Custom Sheets to Roof Plane */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-sky-600" />
          <span>Add Custom Sheet Run to Roof Plane</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Target Facet / Plane</label>
            <select
              value={targetFacetId}
              onChange={(e) => setTargetFacetId(e.target.value)}
              className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
            >
              {facets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.pitchDeg}°)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Cut Length (mm)</label>
            <input
              type="number"
              step="50"
              value={newSheetLengthMm}
              onChange={(e) => setNewSheetLengthMm(Number(e.target.value))}
              className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Quantity (Sheets)</label>
            <input
              type="number"
              min="1"
              value={newSheetCount}
              onChange={(e) => setNewSheetCount(Number(e.target.value))}
              className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-900"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleAddSheets}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Schedule</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hardware & Fixings Auto-Pack */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-600" />
          <span>Automatic Hardware, Screws &amp; Underlay Requisition</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Roofing Fasteners</div>
            <div className="font-mono text-base font-extrabold text-slate-900">
              {hardware.totalScrews} screws ({hardware.screwBoxCount} boxes)
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              {hardware.screwDescription} (Class 4/5 w/ EPDM washer)
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Synthetic Underlay</div>
            <div className="font-mono text-base font-extrabold text-slate-900">
              {hardware.underlayRolls} rolls (50m² each)
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Self-supporting heavy-duty breathable membrane (150mm taped laps)
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Profiled Foam Closures</div>
            <div className="font-mono text-base font-extrabold text-slate-900">
              {hardware.foamInfillPairs} pairs (Eaves &amp; Ridge)
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Prevents bird &amp; wind-driven rain ingress into flutes
            </div>
          </div>
        </div>
      </div>

      {/* REVIEW & DISPATCH MODAL */}
      {showManifestModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Ready to Dispatch Long-Run Order to {supplier}
                </h3>
                <p className="text-xs text-slate-500">
                  Project: {project.projectNumber} · {project.title}
                </p>
              </div>
              <button
                onClick={() => setShowManifestModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-72">
              {generateSupplierOrderText(
                project,
                facets,
                [],
                profileKey,
                gauge,
                colorName,
                supplier
              )}
            </pre>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                onClick={handleCopyManifest}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {copiedNotice ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedNotice ? 'Copied to Clipboard!' : 'Copy Order Text'}</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowManifestModal(false)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDispatchOfficialOrder}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Truck className="w-4 h-4" />
                  <span>Confirm &amp; Transmit Order</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
