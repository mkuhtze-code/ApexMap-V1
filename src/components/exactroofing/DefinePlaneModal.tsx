import React, { useState, useEffect } from 'react';
import { PlanEdge, RoofPlane } from '../../types/exactRoofing';
import { X, ArrowRight, ArrowLeft, Check, PenTool } from 'lucide-react';

interface Props {
  edge: PlanEdge | null;
  existingPlane?: RoofPlane | null;
  isOpen: boolean;
  onClose: () => void;
  onSavePlane: (options: {
    pitchDeg: number;
    underlapSide: 'left' | 'right';
    eaveHeightM: number;
    eaveLengthM?: number;
    hasWall?: boolean;
    eaveSetbackM?: number;
    name: string;
  }) => void;
  onAssignFlashing?: (edge: PlanEdge) => void;
}

const COMMON_PITCHES = [5, 8, 12, 15, 18, 22.5, 25, 30];
const COMMON_HEIGHTS = [
  { label: '2.7m (1F)', value: 2.7 },
  { label: '4.1m (Split)', value: 4.1 },
  { label: '5.4m (2F)', value: 5.4 }
];
const COMMON_SETBACKS = [
  { label: '0m Flush', value: 0 },
  { label: '0.45m Std', value: 0.45 },
  { label: '0.6m Deep', value: 0.6 }
];

export const DefinePlaneModal: React.FC<Props> = ({
  edge,
  existingPlane,
  isOpen,
  onClose,
  onSavePlane,
  onAssignFlashing
}) => {
  const [pitch, setPitch] = useState<number>(22.5);
  const [underlap, setUnderlap] = useState<'left' | 'right'>('left');
  const [eaveHeight, setEaveHeight] = useState<number>(2.7);
  const [eaveLength, setEaveLength] = useState<number>(6.0);
  const [hasWall, setHasWall] = useState<boolean>(true);
  const [eaveSetbackM, setEaveSetbackM] = useState<number>(0);
  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !edge) return;
    const rawLen = +Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y).toFixed(2);
    setPitch(existingPlane?.pitchDeg ?? 22.5);
    setUnderlap(existingPlane?.underlapSide ?? 'left');
    setEaveHeight(existingPlane?.eaveHeightM ?? edge.eaveHeightM ?? 2.7);
    setEaveLength(rawLen);
    setHasWall(edge.hasWall !== false);
    setEaveSetbackM(
      typeof edge.eaveSetbackM === 'number' && Number.isFinite(edge.eaveSetbackM)
        ? edge.eaveSetbackM
        : 0
    );
    setName(
      existingPlane?.name ||
        `Roof Area [${edge.id.replace(/^l\d+__/, '').replace('edge-out-', 'Side ')}]`
    );
  }, [isOpen, edge, existingPlane]);

  if (!isOpen || !edge) return null;

  const originalEdgeLenM = +Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y).toFixed(2);
  const effectiveLenM = Math.max(0.5, Number.isFinite(eaveLength) ? eaveLength : originalEdgeLenM);
  const slopeMultiplier = +(1 / Math.cos((pitch * Math.PI) / 180)).toFixed(3);
  const estimatedSlopeM = +(effectiveLenM * 0.45 * slopeMultiplier).toFixed(2);

  const handleSave = () => {
    onSavePlane({
      pitchDeg: pitch,
      underlapSide: underlap,
      eaveHeightM: Math.max(0.5, Math.min(20, Number(eaveHeight) || 2.7)),
      eaveLengthM:
        Math.abs(effectiveLenM - originalEdgeLenM) > 0.02 ? +effectiveLenM.toFixed(2) : undefined,
      hasWall,
      eaveSetbackM: +Math.max(0, Math.min(3.0, Number(eaveSetbackM) || 0)).toFixed(2),
      name: name.trim() || `Roof Area [${edge.id}]`
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header - Plain Language */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div>
            <h3 className="text-base font-extrabold text-white">
              Set Pitch, Wall &amp; Height
            </h3>
            <p className="text-xs text-slate-400 tabular-nums">
              Eave Wall: <span className="font-mono text-white font-bold">{effectiveLenM}m</span> · Height Z:{' '}
              <span className="font-mono text-amber-400 font-bold">{eaveHeight.toFixed(1)}m</span> · Slope:{' '}
              <span className="font-mono text-sky-400 font-bold">~{estimatedSlopeM}m</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 font-bold transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* 1. EAVE WALL LENGTH & Z-HEIGHT */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                Eave / Edge Length (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="40"
                value={eaveLength}
                onChange={(e) => setEaveLength(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-hidden focus:border-blue-500 text-xs tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-amber-400 font-bold block uppercase tracking-wider">
                Eave Height Z (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="15.0"
                value={eaveHeight}
                onChange={(e) => setEaveHeight(Number(e.target.value))}
                className="w-full bg-slate-800 border border-amber-500/40 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-hidden focus:border-amber-400 text-xs tabular-nums"
              />
            </div>
          </div>

          {/* Quick Height Z Presets */}
          <div className="grid grid-cols-3 gap-1.5">
            {COMMON_HEIGHTS.map((h) => (
              <button
                key={h.value}
                type="button"
                onClick={() => setEaveHeight(h.value)}
                className={`py-1.5 rounded-lg font-bold text-[11px] tabular-nums transition-all cursor-pointer ${
                  Math.abs(eaveHeight - h.value) < 0.05
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          {/* 1B. WALL BELOW ROOF & EAVE WIDTH SETBACK */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-white">Wall Below Roof</div>
                <div className="text-[10px] text-slate-400">
                  Sits underneath slope · Set back by eave width
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHasWall(!hasWall)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold cursor-pointer transition-all ${
                  hasWall
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                {hasWall ? 'Wall ON' : 'Wall OFF'}
              </button>
            </div>

            {hasWall && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Eave Width / Setback (m)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="3"
                    value={eaveSetbackM}
                    onChange={(e) => setEaveSetbackM(Math.max(0, Math.min(3, Number(e.target.value) || 0)))}
                    className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-right text-white font-mono font-bold text-xs tabular-nums focus:outline-hidden focus:border-amber-400"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {COMMON_SETBACKS.map((sb) => (
                    <button
                      key={sb.value}
                      type="button"
                      onClick={() => setEaveSetbackM(sb.value)}
                      className={`py-1 rounded-lg font-bold text-[10px] tabular-nums cursor-pointer transition-all ${
                        Math.abs(eaveSetbackM - sb.value) < 0.02
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                      }`}
                    >
                      {sb.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. PITCH SELECTOR */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Roof Pitch: <span className="text-white font-mono text-sm">{pitch}°</span>
              </label>
              <span className="text-[10px] text-slate-400 tabular-nums">
                Rise / Run 1:{Math.round(1 / Math.tan((pitch * Math.PI) / 180))} (×{slopeMultiplier})
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {COMMON_PITCHES.map((deg) => (
                <button
                  key={deg}
                  type="button"
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

          {/* 3. LAY DIRECTION (LEFT / RIGHT) */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Lay Direction
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setUnderlap('left')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  underlap === 'left'
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                    <span>Left to Right</span>
                  </span>
                  {underlap === 'left' && <Check className="w-4 h-4 text-blue-400" />}
                </div>
                <div className="text-[10px] text-slate-400">
                  Standard laying order
                </div>
              </button>

              <button
                type="button"
                onClick={() => setUnderlap('right')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  underlap === 'right'
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <ArrowLeft className="w-4 h-4 text-purple-400" />
                    <span>Right to Left</span>
                  </span>
                  {underlap === 'right' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="text-[10px] text-slate-400">
                  Reverses lap for prevailing wind
                </div>
              </button>
            </div>
          </div>

          {/* 4. ROOF AREA NAME */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
              Roof Area Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Upper North, Lower Terrace"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold focus:outline-hidden focus:border-blue-500 text-xs"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-2.5">
          {onAssignFlashing ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAssignFlashing(edge);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Eave Flashing</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-extrabold text-white text-xs shadow-md transition-all cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
