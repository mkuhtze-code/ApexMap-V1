import React from 'react';
import { SectionSettingsConfig } from '../../types/sections';
import { X, Sliders, Wind, Layers, Sparkles, Check, RefreshCw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: SectionSettingsConfig;
  onUpdateSettings: (newSettings: SectionSettingsConfig) => void;
}

export const SectionSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  if (!isOpen) return null;

  const handleChange = <K extends keyof SectionSettingsConfig>(
    key: K,
    val: SectionSettingsConfig[K]
  ) => {
    onUpdateSettings({ ...settings, [key]: val });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white w-full sm:max-w-xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                ApexMap™ Settings Portal
              </h3>
              <p className="text-xs text-slate-400">
                Fine-tune roll-former specifications and pairing rules
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

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* 1. ROOF FOOTPRINT OUTLINE PRESET */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Roof Outline & Skeleton Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { key: 'l_shape' as const, label: 'L-Shape Hip & Valley', note: 'NZ standard wing' },
                { key: 'rectangular_hip' as const, label: 'Rectangular Hip', note: '4-face pyramid hip' },
                { key: 'straight_gable' as const, label: 'Straight Gable', note: 'Duo-pitch standard' }
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleChange('roofOutlinePreset', item.key)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    settings.roofOutlinePreset === item.key
                      ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-extrabold text-xs flex items-center justify-between">
                    <span>{item.label}</span>
                    {settings.roofOutlinePreset === item.key && (
                      <Check className="w-3.5 h-3.5 text-blue-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.note}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. SHEET DIMENSIONS & CONSTRAINTS */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Roll-Former Sheet Constraints
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-2xl space-y-1">
                <span className="text-[10px] text-slate-400 block font-semibold">Cover Width (m)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="1.2"
                  value={settings.coverWidthM}
                  onChange={(e) => handleChange('coverWidthM', Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 font-mono font-bold text-white text-sm focus:outline-hidden focus:border-blue-500"
                />
                <span className="text-[9px] text-slate-500 block">Standard: 0.76m (760mm)</span>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-2xl space-y-1">
                <span className="text-[10px] text-slate-400 block font-semibold">Max Sheet Length (m)</span>
                <input
                  type="number"
                  step="0.5"
                  min="4"
                  max="24"
                  value={settings.maxSheetLengthM}
                  onChange={(e) => handleChange('maxSheetLengthM', Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 font-mono font-bold text-white text-sm focus:outline-hidden focus:border-blue-500"
                />
                <span className="text-[9px] text-slate-500 block">Transport limit: 12.0m</span>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-2xl space-y-1">
                <span className="text-[10px] text-slate-400 block font-semibold">Eave Overhang (m)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.02"
                  max="0.15"
                  value={settings.eaveOverhangM}
                  onChange={(e) => handleChange('eaveOverhangM', Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 font-mono font-bold text-white text-sm focus:outline-hidden focus:border-blue-500"
                />
                <span className="text-[9px] text-slate-500 block">NZBC E2: 0.05m (50mm)</span>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-2xl space-y-1">
                <span className="text-[10px] text-slate-400 block font-semibold">Min Usable Offcut (m)</span>
                <input
                  type="number"
                  step="0.05"
                  min="0.3"
                  max="2.0"
                  value={settings.minOffcutLengthM}
                  onChange={(e) => handleChange('minOffcutLengthM', Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 font-mono font-bold text-white text-sm focus:outline-hidden focus:border-blue-500"
                />
                <span className="text-[9px] text-slate-500 block">Shorter is scrap: 0.60m</span>
              </div>
            </div>
          </div>

          {/* 3. LAY DIRECTION & WIND INTENTION */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Global Lay Direction Preference
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['Auto', 'LTR', 'RTL', 'Wind'] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => handleChange('preferredGlobalDir', dir)}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                    settings.preferredGlobalDir === dir
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {dir === 'Auto' ? '⚡ Auto Optimal' : dir === 'LTR' ? '➔ Left to Right' : dir === 'RTL' ? '⬅ Right to Left' : '💨 Wind Lap'}
                </button>
              ))}
            </div>
          </div>

          {/* 4. PAIRING AGGRESSIVENESS */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Section Pairing Aggressiveness
            </label>
            <div className="space-y-2">
              {[
                {
                  id: 'strict_same_pitch' as const,
                  title: 'Strict Same Pitch Only',
                  desc: 'Never pair offcuts if pitch differs by even 1°.'
                },
                {
                  id: 'allow_similar_pitch' as const,
                  title: 'Allow Similar Pitch (Recommended)',
                  desc: 'Pairs sections with up to ±3° difference, factoring minor rake trim.'
                },
                {
                  id: 'maximum_yield' as const,
                  title: 'Maximum Steel Yield (Aggressive)',
                  desc: 'Pairs any compatible physical height to minimize total scrap order.'
                }
              ].map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => handleChange('pairingAggressiveness', opt.id)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    settings.pairingAggressiveness === opt.id
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{opt.title}</span>
                    {settings.pairingAggressiveness === opt.id && (
                      <Check className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. DIAGNOSTICS TOGGLE */}
          <div className="bg-slate-800/40 border border-slate-700/60 p-3 rounded-2xl flex items-center justify-between">
            <div>
              <span className="font-bold text-white block">Advanced Diagnostics</span>
              <span className="text-[10px] text-slate-400">
                Show lookahead simulation run times &amp; mill scrap logs
              </span>
            </div>
            <button
              onClick={() => handleChange('showDiagnostics', !settings.showDiagnostics)}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                settings.showDiagnostics ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                  settings.showDiagnostics ? 'left-6' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => {
              onUpdateSettings({
                ...settings,
                coverWidthM: 0.76,
                maxSheetLengthM: 12.0,
                eaveOverhangM: 0.05,
                minOffcutLengthM: 0.60,
                pairingAggressiveness: 'allow_similar_pitch'
              });
            }}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-extrabold text-white text-xs shadow-md transition-all cursor-pointer"
          >
            Apply &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
