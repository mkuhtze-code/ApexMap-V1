import React, { useState } from 'react';
import { RoofSectionDef, LayDirection } from '../../types/sections';
import { X, ArrowRight, ArrowLeft, Compass, Check, Sparkles } from 'lucide-react';

interface Props {
  section: RoofSectionDef | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (sectionId: string, updates: { pitchDeg: number; layDirection: LayDirection; name?: string }) => void;
}

const COMMON_PITCHES = [5, 8, 12, 15, 18, 22.5, 25, 30];

export const SectionEditModal: React.FC<Props> = ({
  section,
  isOpen,
  onClose,
  onSave
}) => {
  if (!isOpen || !section) return null;

  const [pitch, setPitch] = useState<number>(section.pitchDeg);
  const [direction, setDirection] = useState<LayDirection>(section.layDirection);
  const [customName, setCustomName] = useState<string>(section.subtitle);

  const handleSave = () => {
    onSave(section.id, {
      pitchDeg: pitch,
      layDirection: direction,
      name: customName.trim() || section.subtitle
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
        {/* Header with Section Color Swatch */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-sm text-white shadow-xs font-mono"
              style={{ backgroundColor: section.color }}
            >
              {section.code}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                <span>{section.label}</span>
                <span className="text-[10px] text-slate-400 font-normal">({section.role})</span>
              </h3>
              <p className="text-xs text-slate-400">{section.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 font-bold transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-5 text-xs">
          {/* Section Pairing Status */}
          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Offcut Relationship
            </div>
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{section.pairingSummary}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Nominal Run: <strong className="text-white">{section.nominalLengthM}m</strong> · Width: <strong className="text-white">{section.widthM}m</strong> · {section.sheetCount} sheets
            </div>
          </div>

          {/* 1. PITCH SELECTOR */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Roof Pitch: <span className="text-white font-mono text-sm">{pitch}°</span>
              </label>
              <span className="text-[10px] text-slate-400">Fall: 1:{Math.round(1 / Math.tan((pitch * Math.PI) / 180))}</span>
            </div>

            {/* Tactile Pitch Preset Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {COMMON_PITCHES.map((deg) => (
                <button
                  key={deg}
                  onClick={() => setPitch(deg)}
                  className={`py-2 rounded-xl font-bold font-mono text-xs transition-all cursor-pointer ${
                    pitch === deg
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>

            {/* Slider fine tune */}
            <input
              type="range"
              min="3"
              max="45"
              step="0.5"
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* 2. LAY DIRECTION (LTR vs RTL) */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Sheet Laying Direction
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setDirection('LTR')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  direction === 'LTR'
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                    <span>LTR (Left to Right)</span>
                  </span>
                  {direction === 'LTR' && <Check className="w-4 h-4 text-blue-400" />}
                </div>
                <div className="text-[10px] text-slate-400">
                  Standard westerly wind lap
                </div>
              </button>

              <button
                onClick={() => setDirection('RTL')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  direction === 'RTL'
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <ArrowLeft className="w-4 h-4 text-purple-400" />
                    <span>RTL (Right to Left)</span>
                  </span>
                  {direction === 'RTL' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="text-[10px] text-slate-400">
                  Easterly wind / hip flip
                </div>
              </button>
            </div>
          </div>

          {/* 3. SECTION NAME */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
              Section Label / Note
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold focus:outline-hidden focus:border-blue-500 text-xs"
              placeholder="e.g. Main Run 6.0m, East Hip"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-extrabold text-white text-xs shadow-md transition-all cursor-pointer"
          >
            Save &amp; Recalculate
          </button>
        </div>
      </div>
    </div>
  );
};
