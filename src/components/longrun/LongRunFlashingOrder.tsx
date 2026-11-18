import React, { useState } from 'react';
import { Project, OnsiteMaterialOrder } from '../../types/crm';
import { LongRunFlashingItem, FlashingCategory } from '../../types/longrun';
import {
  Layers,
  Plus,
  Trash2,
  Printer,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Scissors,
  Sliders,
  Send,
  ExternalLink
} from 'lucide-react';

interface Props {
  project: Project;
  flashings: LongRunFlashingItem[];
  onUpdateFlashings: (flashings: LongRunFlashingItem[]) => void;
  colorName: string;
  gauge: '0.40mm' | '0.55mm';
  onDispatchOrder: (order: OnsiteMaterialOrder) => void;
  onOpenFlashingWorkshop?: (view?: 'library' | 'orders') => void;
}

export const LongRunFlashingOrder: React.FC<Props> = ({
  project,
  flashings,
  onUpdateFlashings,
  colorName,
  gauge,
  onDispatchOrder,
  onOpenFlashingWorkshop
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [cadPreviewFlashing, setCadPreviewFlashing] = useState<LongRunFlashingItem | null>(null);
  const [workshopNotice, setWorkshopNotice] = useState<string | null>(null);

  // New Flashing Form state
  const [newName, setNewName] = useState('Roll-Top Barge Flashing w/ Safety Kick');
  const [newCategory, setNewCategory] = useState<FlashingCategory>('Barge / Gable');
  const [newGirthMm, setNewGirthMm] = useState<number>(300);
  const [newFoldsCount, setNewFoldsCount] = useState<number>(3);
  const [newStandardLengthMm, setNewStandardLengthMm] = useState<number>(4000);
  const [newQuantity, setNewQuantity] = useState<number>(2);
  const [newSoftEdge, setNewSoftEdge] = useState<boolean>(false);
  const [newLeftMitre, setNewLeftMitre] = useState<string>('45° Apex Mitre');
  const [newRightMitre, setNewRightMitre] = useState<string>('Eaves Stop-End Turn Down');
  const [newNotes, setNewNotes] = useState<string>('');

  const totalFlashingLm = flashings.reduce(
    (acc, curr) => acc + (curr.standardLengthMm * curr.quantity) / 1000,
    0
  );
  const totalPieces = flashings.reduce((acc, curr) => acc + curr.quantity, 0);

  // Transmit flashing orders directly to FlashingWorkshop CNC bending queue
  const handlePushToWorkshopQueue = (singleItem?: LongRunFlashingItem) => {
    const itemsToPush = singleItem ? [singleItem] : flashings;
    try {
      const existingRaw = localStorage.getItem('archtech_flashing_orders');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      
      const newLines = itemsToPush.map((item, idx) => ({
        id: `ord-${Date.now()}-${idx}`,
        projectId: project.id,
        projectName: `${project.projectNumber} · ${project.title}`,
        profileId: item.id,
        profileName: `[${item.mark}] ${item.name}`,
        quantity: item.quantity,
        pieceLengthLm: item.standardLengthMm / 1000,
        totalLinearMetres: item.totalLengthLm,
        girthTier: item.girthMm <= 300 ? 'Under 300mm' : item.girthMm <= 400 ? '300-400mm' : '400-500mm',
        developedBlankWidthMm: item.girthMm,
        notes: `Gauge: ${item.gauge} · Finish: ${item.colorName} · Left: ${item.leftMitre || 'Square'} · Right: ${item.rightMitre || 'Square'}${item.notes ? ` · Note: ${item.notes}` : ''}`,
        createdAt: new Date().toISOString().split('T')[0],
        status: 'Ready for production' as const
      }));

      localStorage.setItem('archtech_flashing_orders', JSON.stringify([...newLines, ...existing]));

      const updated = flashings.map((f) => {
        if (!singleItem || f.id === singleItem.id) {
          return { ...f, status: 'ordered' as const };
        }
        return f;
      });
      onUpdateFlashings(updated);

      setWorkshopNotice(`✓ Transmitted ${itemsToPush.length} flashing mark(s) to Flashing Workshop Bending Queue`);
      setTimeout(() => setWorkshopNotice(null), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  // Quick preset catalog
  const FLASHING_PRESETS: {
    name: string;
    category: FlashingCategory;
    girthMm: number;
    foldsCount: number;
    standardLengthMm: number;
    softEdge: boolean;
    leftMitre: string;
    rightMitre: string;
    notes: string;
  }[] = [
    {
      name: 'Roll-Top Barge Flashing w/ Safety Kick',
      category: 'Barge / Gable',
      girthMm: 300,
      foldsCount: 3,
      standardLengthMm: 4000,
      softEdge: false,
      leftMitre: '45° Apex Mitre',
      rightMitre: 'Eaves Stop-End Turn Down',
      notes: 'Classic rolled safety hem against raking barge board'
    },
    {
      name: 'Square Fluted Barge Flashing',
      category: 'Barge / Gable',
      girthMm: 350,
      foldsCount: 4,
      standardLengthMm: 4000,
      softEdge: false,
      leftMitre: 'Square Cut',
      rightMitre: 'Under-Fascia Return',
      notes: 'Contemporary clean-line barge for trapezoidal profiles'
    },
    {
      name: 'Corrugate Soft-Edge Ridge Cap',
      category: 'Ridge Cap',
      girthMm: 450,
      foldsCount: 4,
      standardLengthMm: 6000,
      softEdge: true,
      leftMitre: '150mm Lap',
      rightMitre: 'Apex Lap',
      notes: 'Dressable soft lead/zinc strip factory flanged to ridge wings'
    },
    {
      name: 'Two-Piece Adjustable Ventilated Ridge',
      category: 'Ridge Cap',
      girthMm: 450,
      foldsCount: 4,
      standardLengthMm: 6000,
      softEdge: false,
      leftMitre: 'Lap',
      rightMitre: 'Lap',
      notes: 'Permits continuous attic cavity cross-ventilation conforming to NZBC'
    },
    {
      name: 'Internal Valley Gutter w/ 25mm Safety Hems',
      category: 'Internal Valley',
      girthMm: 450,
      foldsCount: 4,
      standardLengthMm: 4000,
      softEdge: false,
      leftMitre: 'Valley Apex Mitre',
      rightMitre: 'Gutter Bird-Beak Splay',
      notes: '0.55mm BMT heavy gauge with double safety turned hems'
    },
    {
      name: 'Over-Apron Wall Abutment Flashing',
      category: 'Apron / Abutment',
      girthMm: 300,
      foldsCount: 3,
      standardLengthMm: 4000,
      softEdge: true,
      leftMitre: 'End Stop Cleat',
      rightMitre: 'Corner Wrap 100mm',
      notes: '85mm upstand under weatherboard cavity with dressable pan edge'
    },
    {
      name: 'Eaves Drip Edge / Gutter Starter',
      category: 'Eaves Drip Edge',
      girthMm: 150,
      foldsCount: 2,
      standardLengthMm: 3000,
      softEdge: false,
      leftMitre: 'Square',
      rightMitre: 'Square',
      notes: 'Prevents underlay water tension ponding on top of fascia board'
    },
    {
      name: 'Parapet Capping (5° Washfall Slope)',
      category: 'Parapet Capping',
      girthMm: 450,
      foldsCount: 4,
      standardLengthMm: 4000,
      softEdge: false,
      leftMitre: 'Corner Mitre Lap',
      rightMitre: 'Stop End',
      notes: 'Slopes 5° inwards towards roof pan drainage to prevent wall staining'
    }
  ];

  const handleApplyPreset = (preset: typeof FLASHING_PRESETS[0]) => {
    setNewName(preset.name);
    setNewCategory(preset.category);
    setNewGirthMm(preset.girthMm);
    setNewFoldsCount(preset.foldsCount);
    setNewStandardLengthMm(preset.standardLengthMm);
    setNewSoftEdge(preset.softEdge);
    setNewLeftMitre(preset.leftMitre);
    setNewRightMitre(preset.rightMitre);
    setNewNotes(preset.notes);
  };

  const handleAddFlashing = () => {
    const markNumber = flashings.length + 1;
    const mark = `FL-${markNumber < 10 ? '0' + markNumber : markNumber}`;

    const item: LongRunFlashingItem = {
      id: `fl-${Date.now()}`,
      mark,
      name: newName,
      category: newCategory,
      girthMm: newGirthMm,
      foldsCount: newFoldsCount,
      standardLengthMm: newStandardLengthMm,
      quantity: newQuantity,
      totalLengthLm: (newStandardLengthMm * newQuantity) / 1000,
      effectiveLapMm: 150,
      colorName,
      gauge: newCategory === 'Internal Valley' ? '0.55mm' : gauge,
      softEdgeFitted: newSoftEdge,
      leftMitre: newLeftMitre,
      rightMitre: newRightMitre,
      status: 'ordered',
      notes: newNotes
    };

    onUpdateFlashings([...flashings, item]);
    setShowAddModal(false);
  };

  const handleRemoveFlashing = (id: string) => {
    onUpdateFlashings(flashings.filter((f) => f.id !== id));
  };

  const handleStatusChange = (id: string, status: LongRunFlashingItem['status']) => {
    onUpdateFlashings(
      flashings.map((f) => (f.id === id ? { ...f, status } : f))
    );
  };

  const handleCopyFlashingSchedule = () => {
    let text = `======================================================================
LONGRUN FLASHING CUT & FOLD SCHEDULE
Project: ${project.projectNumber} · ${project.title}
Color: ${colorName} (${gauge})
Site Delivery: ${project.siteAddress}
Total Lineal: ${totalFlashingLm.toFixed(1)} lm (${totalPieces} pieces)
======================================================================\n\n`;

    flashings.forEach((fl) => {
      text += `[${fl.mark}] ${fl.name}\n`;
      text += `  • Qty: ${fl.quantity} pcs @ ${(fl.standardLengthMm / 1000).toFixed(1)}m (${(fl.totalLengthLm).toFixed(1)} lm)\n`;
      text += `  • Girth: ${fl.girthMm}mm | Folds: ${fl.foldsCount} | Gauge: ${fl.gauge}\n`;
      if (fl.softEdgeFitted) text += `  • Edge: Soft Lead/Zinc Dressable Strip\n`;
      text += `  • Ends: Left: ${fl.leftMitre || 'Square'} | Right: ${fl.rightMitre || 'Square'}\n`;
      if (fl.notes) text += `  • Notes: ${fl.notes}\n`;
      text += `\n`;
    });

    navigator.clipboard.writeText(text);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 3000);
  };

  const filteredFlashings = flashings.filter(
    (f) => filterCategory === 'all' || f.category === filterCategory
  );

  return (
    <div className="space-y-4">
      {/* Toast Notice */}
      {workshopNotice && (
        <div className="bg-purple-950 text-purple-200 border border-purple-700 p-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{workshopNotice}</span>
          </div>
          {onOpenFlashingWorkshop && (
            <button
              onClick={() => onOpenFlashingWorkshop('orders')}
              className="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-[11px] font-bold cursor-pointer"
            >
              View Workshop Queue ➔
            </button>
          )}
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Layers className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Long-Run Roof Flashings Order &amp; Folding Schedule
              </h3>
              <p className="text-[11px] text-slate-500">
                Color-matched {colorName} ({gauge}) with standard 150mm lap allowances
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handlePushToWorkshopQueue()}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              title="Push all items directly to the workshop CNC brake press bending queue"
            >
              <Send className="w-3.5 h-3.5 text-purple-200" />
              <span>Push All to Workshop Queue</span>
            </button>

            {onOpenFlashingWorkshop && (
              <button
                onClick={() => onOpenFlashingWorkshop('library')}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                title="Open 2D CAD Bending Designer & Fold Library"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-600" />
                <span>Flashing Workshop CAD</span>
              </button>
            )}

            <button
              onClick={handleCopyFlashingSchedule}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {copiedNotice ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedNotice ? 'Schedule Copied!' : 'Copy Schedule'}</span>
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Flashing</span>
            </button>
          </div>
        </div>

        {/* Quick Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[10px] font-bold uppercase text-slate-400">Total Flashing Length</div>
            <div className="text-lg font-mono font-extrabold text-slate-900 mt-0.5">
              {totalFlashingLm.toFixed(1)} <span className="text-xs font-normal text-slate-500">lm</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[10px] font-bold uppercase text-slate-400">Total Folded Pieces</div>
            <div className="text-lg font-mono font-extrabold text-slate-900 mt-0.5">
              {totalPieces} <span className="text-xs font-normal text-slate-500">pcs</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[10px] font-bold uppercase text-slate-400">Color Finish</div>
            <div className="text-sm font-bold text-slate-900 truncate mt-1">
              {colorName}
            </div>
            <div className="text-[10px] text-slate-500">{gauge} G550 Coil</div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[10px] font-bold uppercase text-slate-400">Standard Lengths</div>
            <div className="text-sm font-bold text-slate-900 mt-1">3.0m · 4.0m · 6.0m</div>
            <div className="text-[10px] text-emerald-600 font-medium">+150mm laps included</div>
          </div>
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {(
          [
            { id: 'all', label: 'All Flashings' },
            { id: 'Barge / Gable', label: 'Barges' },
            { id: 'Ridge Cap', label: 'Ridges & Hips' },
            { id: 'Internal Valley', label: 'Valleys' },
            { id: 'Apron / Abutment', label: 'Aprons' },
            { id: 'Eaves Drip Edge', label: 'Eaves Drips' }
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterCategory(tab.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterCategory === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Flashing List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="divide-y divide-slate-100">
          {filteredFlashings.map((fl) => (
            <div key={fl.id} className="p-4 hover:bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">
                    {fl.mark}
                  </span>
                  <span className="font-bold text-slate-900 text-sm">{fl.name}</span>
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    {fl.category}
                  </span>
                  {fl.softEdgeFitted && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      Soft-Edge Dressable
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-slate-500 text-[11px]">
                  <span>
                    Girth: <strong className="text-slate-800">{fl.girthMm}mm</strong> ({fl.foldsCount} folds)
                  </span>
                  <span>·</span>
                  <span>
                    Piece Length: <strong className="text-slate-800 font-mono">{(fl.standardLengthMm / 1000).toFixed(1)}m</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Gauge: <strong className="text-slate-800">{fl.gauge}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Ends: <strong className="text-slate-800">{fl.leftMitre || 'Square'}</strong> ➔ <strong className="text-slate-800">{fl.rightMitre || 'Square'}</strong>
                  </span>
                </div>

                {fl.notes && <p className="text-[11px] text-slate-600 italic">{fl.notes}</p>}

                {/* Quick CAD & Workshop Action Links */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => setCadPreviewFlashing(fl)}
                    className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="View CAD cross section fold geometry and angles"
                  >
                    <Sliders className="w-3 h-3 text-purple-600" />
                    <span>View CAD Cross-Section</span>
                  </button>

                  <button
                    onClick={() => handlePushToWorkshopQueue(fl)}
                    className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Queue this profile into the workshop brake press folding schedule"
                  >
                    <Send className="w-3 h-3 text-sky-600" />
                    <span>Send to Workshop Queue</span>
                  </button>
                </div>
              </div>

              {/* Quantity, LM & Status Checkoff */}
              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div className="text-right font-mono">
                  <div className="text-sm font-extrabold text-slate-900">
                    {fl.quantity} pcs @ {(fl.standardLengthMm / 1000).toFixed(1)}m
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Total: {fl.totalLengthLm.toFixed(1)} lineal metres
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {(['pending', 'ordered', 'folded', 'installed'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleStatusChange(fl.id, st)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold capitalize transition-all cursor-pointer ${
                        fl.status === st
                          ? st === 'installed'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}

                  <button
                    onClick={() => handleRemoveFlashing(fl.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors ml-1 cursor-pointer"
                    title="Remove Flashing"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ADD FLASHING MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">Add Long-Run Roof Flashing</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                1-Tap Long-Run Presets
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FLASHING_PRESETS.slice(0, 4).map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="truncate font-bold">{p.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">Girth: {p.girthMm}mm · {p.category}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500">Flashing Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
                  >
                    <option value="Barge / Gable">Barge / Gable</option>
                    <option value="Ridge Cap">Ridge Cap</option>
                    <option value="Internal Valley">Internal Valley</option>
                    <option value="Apron / Abutment">Apron / Abutment</option>
                    <option value="Eaves Drip Edge">Eaves Drip Edge</option>
                    <option value="Parapet Capping">Parapet Capping</option>
                    <option value="Custom Fold">Custom Fold</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500">Girth (mm)</label>
                  <input
                    type="number"
                    step="25"
                    value={newGirthMm}
                    onChange={(e) => setNewGirthMm(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500">Standard Piece Length</label>
                  <select
                    value={newStandardLengthMm}
                    onChange={(e) => setNewStandardLengthMm(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
                  >
                    <option value={3000}>3,000mm (3.0 Metre Standard)</option>
                    <option value={4000}>4,000mm (4.0 Metre Standard)</option>
                    <option value={6000}>6,000mm (6.0 Metre Full Fold)</option>
                    <option value={2400}>2,400mm (Short Length)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500">Quantity (Pieces)</label>
                  <input
                    type="number"
                    min="1"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500">Left End Mitre</label>
                  <input
                    type="text"
                    value={newLeftMitre}
                    onChange={(e) => setNewLeftMitre(e.target.value)}
                    placeholder="e.g. 45° Apex Mitre"
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500">Right End Mitre</label>
                  <input
                    type="text"
                    value={newRightMitre}
                    onChange={(e) => setNewRightMitre(e.target.value)}
                    placeholder="e.g. Stop-End Turn Down"
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-medium"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSoftEdge}
                  onChange={(e) => setNewSoftEdge(e.target.checked)}
                  className="rounded text-sky-600 w-4 h-4"
                />
                <span className="font-semibold text-slate-800">
                  Fitted Soft-Edge Strip (Dressable lead/zinc edge for corrugated crests)
                </span>
              </label>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500">Site &amp; Folding Notes</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. 25mm safety hem against raking barge"
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddFlashing}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Add to Flashing Schedule
              </button>
            </div>
          </div>
        </div>
      )}
      {/* CAD FOLD PREVIEW MODAL */}
      {cadPreviewFlashing && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase text-purple-600">
                    Flashing Workshop · CAD Fold Spec
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    [{cadPreviewFlashing.mark}] {cadPreviewFlashing.name}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setCadPreviewFlashing(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Vector Cross-Section CAD Preview */}
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-2 left-3 text-[10px] font-mono text-slate-400 uppercase">
                Cross-Section Profile View (Brake Press Tooling)
              </div>
              <div className="absolute top-2 right-3 text-[10px] font-mono text-purple-400">
                Girth: {cadPreviewFlashing.girthMm}mm · {cadPreviewFlashing.foldsCount} Folds
              </div>

              <svg viewBox="0 0 320 160" className="w-full max-w-sm h-40 overflow-visible mt-4">
                {/* Grid guidelines */}
                <line x1="20" y1="80" x2="300" y2="80" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
                <line x1="160" y1="20" x2="160" y2="140" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />

                {cadPreviewFlashing.category === 'Ridge Cap' ? (
                  <g>
                    {/* Ridge Wing Left */}
                    <line x1="40" y1="120" x2="160" y2="45" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Ridge Wing Right */}
                    <line x1="160" y1="45" x2="280" y2="120" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Apex Bend Point */}
                    <circle cx="160" cy="45" r="4" fill="#a855f7" />
                    {/* Soft edge lead strip if fitted */}
                    {cadPreviewFlashing.softEdgeFitted && (
                      <g>
                        <path d="M 30 120 Q 35 125 40 120" stroke="#f59e0b" strokeWidth="3" fill="none" />
                        <path d="M 280 120 Q 285 125 290 120" stroke="#f59e0b" strokeWidth="3" fill="none" />
                        <text x="30" y="140" fill="#f59e0b" fontSize="8" fontFamily="monospace">Soft-Edge Lead Strip</text>
                      </g>
                    )}
                    <text x="140" y="32" fill="#e2e8f0" fontSize="9" fontWeight="bold" fontFamily="monospace">150° Apex</text>
                  </g>
                ) : cadPreviewFlashing.category === 'Internal Valley' ? (
                  <g>
                    {/* Safety hem left */}
                    <line x1="50" y1="60" x2="65" y2="50" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Valley pan left */}
                    <line x1="65" y1="50" x2="160" y2="125" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Valley pan right */}
                    <line x1="160" y1="125" x2="255" y2="50" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Safety hem right */}
                    <line x1="255" y1="50" x2="270" y2="60" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Valley Trough point */}
                    <circle cx="160" cy="125" r="4" fill="#a855f7" />
                    <text x="135" y="145" fill="#e2e8f0" fontSize="9" fontWeight="bold" fontFamily="monospace">110° Trough</text>
                    <text x="40" y="42" fill="#94a3b8" fontSize="8" fontFamily="monospace">25mm Safety Hem</text>
                  </g>
                ) : cadPreviewFlashing.category === 'Apron / Abutment' ? (
                  <g>
                    {/* Upstand turn in cavity */}
                    <line x1="80" y1="30" x2="95" y2="30" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Vertical upstand */}
                    <line x1="95" y1="30" x2="95" y2="100" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Slope cover wing */}
                    <line x1="95" y1="100" x2="250" y2="120" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Hem kick */}
                    <line x1="250" y1="120" x2="260" y2="115" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="95" cy="100" r="4" fill="#a855f7" />
                    <text x="105" y="95" fill="#e2e8f0" fontSize="9" fontWeight="bold" fontFamily="monospace">95° Step</text>
                  </g>
                ) : (
                  <g>
                    {/* Generic Barge / Gable Roll-Top */}
                    {/* Safety Kick Return */}
                    <line x1="60" y1="125" x2="75" y2="135" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Fascia Downstand */}
                    <line x1="75" y1="135" x2="75" y2="55" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Top Rake Flange */}
                    <line x1="75" y1="55" x2="240" y2="55" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    {/* Pan Hem */}
                    <line x1="240" y1="55" x2="255" y2="45" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="75" cy="55" r="4" fill="#a855f7" />
                    <circle cx="240" cy="55" r="4" fill="#a855f7" />
                    <text x="85" y="50" fill="#e2e8f0" fontSize="9" fontWeight="bold" fontFamily="monospace">90° Barge Bend</text>
                    <text x="45" y="145" fill="#94a3b8" fontSize="8" fontFamily="monospace">15mm Kick</text>
                  </g>
                )}
              </svg>
            </div>

            {/* Spec details grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase text-slate-400">Total Girth</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5">{cadPreviewFlashing.girthMm} mm</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase text-slate-400">Coil Gauge</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5">{cadPreviewFlashing.gauge}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase text-slate-400">Standard Length</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5">{(cadPreviewFlashing.standardLengthMm / 1000).toFixed(1)} m</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase text-slate-400">Finish</div>
                <div className="font-bold text-slate-900 mt-0.5 truncate">{colorName}</div>
              </div>
            </div>

            <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-xs space-y-1">
              <div className="font-bold text-purple-900 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-purple-700" />
                <span>Brake Press Technical Sequence</span>
              </div>
              <p className="text-purple-700 text-[11px] leading-relaxed">
                Formed on standard 6.0m CNC folder with 0.8mm inside radius tooling conforming to NZBC E2/AS1. Minimum lap allowance of 150mm with silicone sealant beads.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCadPreviewFlashing(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {onOpenFlashingWorkshop && (
                  <button
                    type="button"
                    onClick={() => {
                      setCadPreviewFlashing(null);
                      onOpenFlashingWorkshop('library');
                    }}
                    className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5 text-purple-600" />
                    <span>Open in 2D Workshop Editor</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    handlePushToWorkshopQueue(cadPreviewFlashing);
                    setCadPreviewFlashing(null);
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5 text-sky-400" />
                  <span>Push to Workshop Bending Queue</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
