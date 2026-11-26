import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Trash2,
  X
} from 'lucide-react';
import {
  FlashingRule,
  FlashingRuleSet,
  RoofLineFlashingKind,
  RoofProfileFamily,
  VentedRidgeOption,
  WindZoneCode
} from '../../types/exactRoofing';

interface Props {
  isOpen: boolean;
  ruleSet: FlashingRuleSet;
  readOnly?: boolean;
  onClose: () => void;
  onSaveRuleSet: (next: FlashingRuleSet) => void;
  onResetSeeds: () => FlashingRuleSet;
  onReapplyFlashings?: (next: FlashingRuleSet) => void;
}

const PROFILE_FAMILIES: { value: RoofProfileFamily; label: string }[] = [
  { value: 'corrugate', label: 'Corrugate' },
  { value: 'trapezoidal', label: 'Trapezoidal' },
  { value: 'standing_seam', label: 'Standing Seam' },
  { value: '*', label: 'All Profiles (*)' }
];

const LINE_KINDS: { value: RoofLineFlashingKind | '*'; label: string }[] = [
  { value: 'ridge', label: 'Ridge' },
  { value: 'hip', label: 'Hip' },
  { value: 'barge', label: 'Barge' },
  { value: 'valley', label: 'Valley' },
  { value: 'apron', label: 'Apron' },
  { value: 'eave', label: 'Eave Drip' },
  { value: 'dormer_ridge', label: 'Dormer Ridge' },
  { value: 'dormer_barge', label: 'Dormer Barge' },
  { value: 'dormer_valley', label: 'Dormer Valley' },
  { value: 'dormer_apron', label: 'Dormer Apron' },
  { value: '*', label: 'Any Line (*)' }
];

const WIND_ZONES: WindZoneCode[] = ['L', 'M', 'H', 'VH', 'EH'];

const VENTED_OPTIONS: { value: VentedRidgeOption | '*'; label: string }[] = [
  { value: 'none', label: 'Standard (None)' },
  { value: 'RV10P', label: 'RV10P Vented' },
  { value: '*', label: 'Any (*)' }
];

const LIBRARY_PRESET_IDS = [
  { id: 'preset-ventilated-ridge', label: 'Ventilated Ridge / Hip Cap' },
  { id: 'preset-barge-roll', label: 'Barge Flashing / Roll' },
  { id: 'preset-valley-gutter', label: 'Valley Gutter' },
  { id: 'preset-apron-kick', label: 'Apron Flashing w/ Kick' }
];

export const FlashingRulesModal: React.FC<Props> = ({
  isOpen,
  ruleSet,
  readOnly = false,
  onClose,
  onSaveRuleSet,
  onResetSeeds,
  onReapplyFlashings
}) => {
  const [draftRules, setDraftRules] = useState<FlashingRule[]>(ruleSet.rules);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(
    ruleSet.rules[0]?.id || null
  );
  const [filterFamily, setFilterFamily] = useState<'all' | RoofProfileFamily>('all');
  const [confirmingReset, setConfirmingReset] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    const cloned = ruleSet.rules.map((r) => ({ ...r }));
    setDraftRules(cloned);
    setSelectedRuleId((prev) =>
      prev && cloned.some((r) => r.id === prev) ? prev : cloned[0]?.id || null
    );
    setConfirmingReset(false);
  }, [isOpen, ruleSet]);

  if (!isOpen) return null;

  const filteredRules =
    filterFamily === 'all'
      ? draftRules
      : draftRules.filter((r) => r.profileFamily === filterFamily);

  const activeRule = draftRules.find((r) => r.id === selectedRuleId) || null;

  const updateRule = (id: string, patch: Partial<FlashingRule>) => {
    if (readOnly) return;
    setDraftRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleAddRule = () => {
    if (readOnly) return;
    const newId = `custom-rule-${Date.now()}`;
    const nextRule: FlashingRule = {
      id: newId,
      label: 'Custom Flashing Rule',
      enabled: true,
      profileFamily: filterFamily !== 'all' && filterFamily !== '*' ? filterFamily : 'corrugate',
      lineKind: 'ridge',
      windMin: null,
      windMax: null,
      ventedRidge: 'none',
      libraryProfileId: 'preset-ventilated-ridge',
      productCode: 'RIDGE-CUSTOM',
      coverMm: 180,
      priority: 120,
      preferredStickMm: 2400,
      maxStickMm: 3000,
      joinAllowanceMm: 150,
      endAllowanceMm: 30,
      shopNotes: '180mm cover; 150mm lap, 30mm end turn.'
    };
    setDraftRules((prev) => [nextRule, ...prev]);
    setSelectedRuleId(newId);
  };

  const handleDuplicateRule = (rule: FlashingRule) => {
    if (readOnly) return;
    const dupId = `rule-copy-${Date.now()}`;
    const dup: FlashingRule = {
      ...rule,
      id: dupId,
      label: `${rule.label} (Copy)`,
      priority: rule.priority + 1
    };
    setDraftRules((prev) => [dup, ...prev]);
    setSelectedRuleId(dupId);
  };

  const handleDeleteRule = (id: string) => {
    if (readOnly) return;
    setDraftRules((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (selectedRuleId === id) {
        setSelectedRuleId(next[0]?.id || null);
      }
      return next;
    });
  };

  const buildNextRuleSet = (): FlashingRuleSet => ({
    version: Number(ruleSet.version || 1) + 1,
    updatedAt: new Date().toISOString(),
    rules: draftRules
  });

  const handleSave = () => {
    if (readOnly) {
      onClose();
      return;
    }
    const next = buildNextRuleSet();
    onSaveRuleSet(next);
    onClose();
  };

  const handleSaveAndReapply = () => {
    if (readOnly) return;
    const next = buildNextRuleSet();
    onSaveRuleSet(next);
    onReapplyFlashings?.(next);
    onClose();
  };

  const handleConfirmResetSeeds = () => {
    if (readOnly) return;
    const reset = onResetSeeds();
    setDraftRules(reset.rules.map((r) => ({ ...r })));
    setSelectedRuleId(reset.rules[0]?.id || null);
    setConfirmingReset(false);
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[92dvh] bg-[#0b101d] border border-slate-700 rounded-2xl shadow-2xl text-white flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-[#070b14]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-white">
                Standard Flashing Rules Admin
              </h2>
              <p className="text-[11px] text-slate-400">
                Quote &amp; Measure rule engine · specificity + priority · manual lines stay protected
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {readOnly && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                Locked Snapshot (Read-Only)
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 cursor-pointer"
              aria-label="Close Flashing Rules"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Rule List */}
          <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col min-h-0 max-h-[38dvh] md:max-h-none">
            <div className="p-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-1.5 bg-slate-950/50">
              <select
                value={filterFamily}
                onChange={(e) => setFilterFamily(e.target.value as 'all' | RoofProfileFamily)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs font-bold text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">All Profile Families ({draftRules.length})</option>
                {PROFILE_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              {!readOnly && (
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Rule</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredRules.map((r) => {
                const isSelected = r.id === selectedRuleId;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRuleId(r.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-sky-600/15 border-sky-500/60'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-white truncate">
                          {r.label}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate">
                          {r.productCode} · {r.coverMm}mm ·{' '}
                          {r.windMin || r.windMax ? `${r.windMin || 'L'}–${r.windMax || 'EH'}` : 'Any Wind'} ·{' '}
                          {r.profileFamily} · {r.lineKind}
                          {r.ventedRidge && r.ventedRidge !== '*' ? ` · ${r.ventedRidge}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateRule(r.id, { enabled: !r.enabled });
                        }}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase shrink-0 cursor-pointer disabled:opacity-50 ${
                          r.enabled
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {r.enabled ? 'On' : 'Off'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rule Editor */}
          <div className="md:col-span-7 overflow-y-auto p-4 space-y-3">
            {!activeRule ? (
              <div className="text-xs text-slate-400 py-8 text-center">
                Select or add a flashing rule to configure cover widths, wind range, stick limits, and shop notes.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-sky-400 font-bold">
                      Rule ID: {activeRule.id}
                    </div>
                    <div className="text-sm font-black text-white">{activeRule.label}</div>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDuplicateRule(activeRule)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Duplicate</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(activeRule.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-bold text-slate-400">Rule Label</span>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={activeRule.label}
                      onChange={(e) => updateRule(activeRule.id, { label: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-sky-500 disabled:opacity-60"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Profile Family</span>
                    <select
                      disabled={readOnly}
                      value={activeRule.profileFamily}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          profileFamily: e.target.value as RoofProfileFamily
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none disabled:opacity-60"
                    >
                      {PROFILE_FAMILIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Roof Line Kind</span>
                    <select
                      disabled={readOnly}
                      value={activeRule.lineKind}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          lineKind: e.target.value as RoofLineFlashingKind | '*'
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none disabled:opacity-60"
                    >
                      {LINE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Wind Zone Min</span>
                    <select
                      disabled={readOnly}
                      value={activeRule.windMin ?? ''}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          windMin: e.target.value ? (e.target.value as WindZoneCode) : null
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none disabled:opacity-60"
                    >
                      <option value="">Any (Null)</option>
                      {WIND_ZONES.map((wz) => (
                        <option key={wz} value={wz}>
                          {wz}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Wind Zone Max</span>
                    <select
                      disabled={readOnly}
                      value={activeRule.windMax ?? ''}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          windMax: e.target.value ? (e.target.value as WindZoneCode) : null
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none disabled:opacity-60"
                    >
                      <option value="">Any (Null)</option>
                      {WIND_ZONES.map((wz) => (
                        <option key={wz} value={wz}>
                          {wz}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Vented Ridge Option</span>
                    <select
                      disabled={readOnly}
                      value={activeRule.ventedRidge ?? '*'}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          ventedRidge:
                            e.target.value === '*' ? null : (e.target.value as VentedRidgeOption)
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none disabled:opacity-60"
                    >
                      {VENTED_OPTIONS.map((vo) => (
                        <option key={vo.value} value={vo.value}>
                          {vo.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Library Profile Template</span>
                    <select
                      disabled={readOnly}
                      value={activeRule.libraryProfileId}
                      onChange={(e) =>
                        updateRule(activeRule.id, { libraryProfileId: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold outline-none disabled:opacity-60"
                    >
                      {LIBRARY_PRESET_IDS.map((lp) => (
                        <option key={lp.id} value={lp.id}>
                          {lp.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Product Code</span>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={activeRule.productCode}
                      onChange={(e) => updateRule(activeRule.id, { productCode: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sky-300 font-mono font-bold outline-none focus:border-sky-500 disabled:opacity-60"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Cover Width (mm)</span>
                    <input
                      type="number"
                      min={50}
                      max={600}
                      disabled={readOnly}
                      value={activeRule.coverMm}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          coverMm: Math.max(50, Math.round(Number(e.target.value) || 150))
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold outline-none focus:border-sky-500 disabled:opacity-60"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Priority (Higher Wins Ties)</span>
                    <input
                      type="number"
                      disabled={readOnly}
                      value={activeRule.priority}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          priority: Math.round(Number(e.target.value) || 0)
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold outline-none focus:border-sky-500 disabled:opacity-60"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Preferred Stick (mm)</span>
                    <input
                      type="number"
                      min={300}
                      max={6000}
                      step={50}
                      disabled={readOnly}
                      value={activeRule.preferredStickMm}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          preferredStickMm: Math.max(300, Math.round(Number(e.target.value) || 2400))
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold outline-none disabled:opacity-60"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Max Stick (mm)</span>
                    <input
                      type="number"
                      min={600}
                      max={8000}
                      step={50}
                      disabled={readOnly}
                      value={activeRule.maxStickMm}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          maxStickMm: Math.max(600, Math.round(Number(e.target.value) || 3000))
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold outline-none disabled:opacity-60"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">Join Lap Allowance (mm)</span>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      step={10}
                      disabled={readOnly}
                      value={activeRule.joinAllowanceMm}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          joinAllowanceMm: Math.max(0, Math.round(Number(e.target.value) || 0))
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold outline-none disabled:opacity-60"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-400">End Turn Allowance (mm)</span>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      step={5}
                      disabled={readOnly}
                      value={activeRule.endAllowanceMm}
                      onChange={(e) =>
                        updateRule(activeRule.id, {
                          endAllowanceMm: Math.max(0, Math.round(Number(e.target.value) || 0))
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold outline-none disabled:opacity-60"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-bold text-slate-400">Shop / Fabrication Notes</span>
                    <textarea
                      rows={2}
                      disabled={readOnly}
                      value={activeRule.shopNotes}
                      onChange={(e) => updateRule(activeRule.id, { shopNotes: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-200 font-sans outline-none focus:border-sky-500 disabled:opacity-60"
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-[#070b14] flex flex-wrap items-center justify-between gap-2">
          <div>
            {!readOnly && (
              confirmingReset ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-amber-300">
                    Restore factory seed rules?
                  </span>
                  <button
                    type="button"
                    onClick={handleConfirmResetSeeds}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Reset seeds</span>
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && onReapplyFlashings && (
              <button
                type="button"
                onClick={handleSaveAndReapply}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold cursor-pointer"
              >
                Save &amp; Re-apply Flashings
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Rules</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
