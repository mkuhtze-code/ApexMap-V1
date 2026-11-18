import React, { useState } from 'react';
import { Point2D, RoofOutline } from '../../types/exactRoofing';
import { buildOutlineFromPoints, parseOutlineFromInput } from '../../utils/exactRoofingEngine';
import { X, Upload, FileCode, Sparkles, Check, AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportOutline: (outline: RoofOutline) => void;
}

const SAMPLE_OUTLINES = [
  {
    name: 'Asymmetric Kiwi L-Shape (16m × 12m)',
    text: `0,0\n16,0\n16,6\n7.5,6\n7.5,12\n0,12`
  },
  {
    name: 'Classic 14m × 10m Rectangle',
    text: `0,0\n14,0\n14,10\n0,10`
  },
  {
    name: 'T-Shape Villa with Return Porch',
    text: `4,0\n11,0\n11,5\n15,5\n15,11\n0,11\n0,5\n4,5`
  },
  {
    name: 'Hexagonal Pavilion (6-Facet Hip)',
    text: `4,0\n10,0\n14,6.9\n10,13.8\n4,13.8\n0,6.9`
  }
];

export const ImportOutlineModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onImportOutline
}) => {
  if (!isOpen) return null;

  const [rawText, setRawText] = useState<string>(SAMPLE_OUTLINES[0].text);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live parsed preview points
  const previewPoints: Point2D[] | null = React.useMemo(() => {
    return parseOutlineFromInput(rawText);
  }, [rawText]);

  const handleApply = () => {
    if (!previewPoints || previewPoints.length < 3) {
      setErrorMsg('Please provide at least 3 valid coordinates to form a closed roof outline.');
      return;
    }
    const newOutline = buildOutlineFromPoints(previewPoints, `outline-import-${Date.now()}`);
    onImportOutline(newOutline);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        setErrorMsg(null);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Import Roof Outline
              </h3>
              <p className="text-xs text-slate-400">
                Paste SVG, JSON, DXF, or coordinate points in metres
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

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Quick Presets Buttons */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
              Quick Sample Templates
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SAMPLE_OUTLINES.map((s) => (
                <button
                  key={s.name}
                  onClick={() => {
                    setRawText(s.text);
                    setErrorMsg(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/70 text-left font-semibold text-slate-200 hover:text-white transition-all cursor-pointer text-[11px]"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Raw Text / Code Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Coordinate Text / SVG / JSON
              </label>
              <label className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer flex items-center gap-1">
                <FileCode className="w-3.5 h-3.5" />
                <span>Upload File</span>
                <input
                  type="file"
                  accept=".txt,.json,.svg,.dxf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              rows={5}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="e.g. 0,0&#10;14,0&#10;14,10&#10;0,10 or <polygon points='...' />"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-white focus:outline-hidden focus:border-blue-500"
            />
          </div>

          {/* Validation Status & Point Count */}
          {previewPoints && previewPoints.length >= 3 ? (
            <div className="bg-emerald-950/40 border border-emerald-800/50 p-3 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Valid Outline: {previewPoints.length} vertices detected</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">
                Ready to import
              </span>
            </div>
          ) : (
            <div className="bg-amber-950/40 border border-amber-800/50 p-3 rounded-2xl flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Enter at least 3 corner coordinates (e.g. x,y per line).</span>
            </div>
          )}

          {errorMsg && (
            <div className="text-xs text-rose-400 font-bold bg-rose-950/40 border border-rose-800/50 p-2.5 rounded-xl">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!previewPoints || previewPoints.length < 3}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-extrabold text-white text-xs shadow-md transition-all cursor-pointer"
          >
            Import &amp; Set Outline
          </button>
        </div>
      </div>
    </div>
  );
};
