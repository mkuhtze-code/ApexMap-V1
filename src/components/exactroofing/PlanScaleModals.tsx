import React, { useState, useEffect } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  FileImage,
  Layers,
  RotateCcw,
  Ruler,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { ArchitecturalPlan } from '../../types/crm';
import { Point2D, RoofPlanUnderlay } from '../../types/exactRoofing';
import {
  createPlanUnderlaySpec,
  parseDistanceInputToMetres
} from '../../utils/exactRoofingEngine';
import { SAMPLE_PROJECT_PLANS } from '../../data/sampleArchitecturalPlans';

// ---------------------------------------------------------------------------
// 1. FIRST-LINE FREEHAND LENGTH POPUP (Required when drawing freehand unscaled)
// ---------------------------------------------------------------------------

interface FirstLineScaleModalProps {
  isOpen: boolean;
  p0: Point2D;
  p1: Point2D;
  onUndoSecondPoint: () => void;
  onConfirmLengthM: (lengthM: number) => void;
}

export const FirstLineScaleModal: React.FC<FirstLineScaleModalProps> = ({
  isOpen,
  p0,
  p1,
  onUndoSecondPoint,
  onConfirmLengthM
}) => {
  const [unit, setUnit] = useState<'m' | 'mm'>('m');
  const [rawValue, setRawValue] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRawValue('');
      setErrorMsg(null);
      setUnit('m');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const angleDeg = Math.round((Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI);
  const absAngle = Math.abs(angleDeg);
  const dirLabel =
    absAngle <= 3 || absAngle >= 177
      ? 'Horizontal Line'
      : Math.abs(absAngle - 90) <= 3
      ? 'Vertical Line'
      : `${angleDeg}° Angle`;

  const parsedMetres = parseDistanceInputToMetres(rawValue, unit);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!parsedMetres) {
      setErrorMsg(
        unit === 'm'
          ? 'Enter a valid length in metres (e.g. 14.5)'
          : 'Enter a valid length in millimetres (e.g. 14500)'
      );
      return;
    }
    onConfirmLengthM(parsedMetres);
  };

  const quickPresets =
    unit === 'm' ? ['6', '8', '10', '12', '14', '18'] : ['6000', '10000', '12000', '14500'];

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-line-scale-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md bg-[#0b101d] border border-slate-700 text-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <h3 id="first-line-scale-title" className="text-base font-extrabold text-white">
                Set First Line Length
              </h3>
              <p className="text-xs text-slate-400">
                Calibrates the drawing scale so remaining walls draw to exact size.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onUndoSecondPoint}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
            aria-label="Undo second point"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visual First Line Indicator */}
        <div className="px-3.5 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-mono font-bold text-emerald-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <span>P1</span>
            <span className="text-slate-600">————</span>
            <span className="text-white tabular-nums">
              {parsedMetres ? `${parsedMetres.toFixed(2)} m` : '? m'}
            </span>
            <span className="text-slate-600">————</span>
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
            <span>P2</span>
          </div>
          <span className="text-[11px] font-medium text-slate-400 shrink-0">{dirLabel}</span>
        </div>

        {/* Unit Switcher + Numeric Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="first-line-length-input" className="text-xs font-bold text-slate-300">
              Measured Length
            </label>
            <div className="flex items-center p-0.5 rounded-xl bg-slate-950 border border-slate-800">
              {(['m', 'mm'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    if (u !== unit) {
                      const num = parseFloat(rawValue);
                      if (Number.isFinite(num) && num > 0) {
                        setRawValue(
                          u === 'mm' ? String(Math.round(num * 1000)) : String(+(num / 1000).toFixed(3))
                        );
                      }
                      setUnit(u);
                      setErrorMsg(null);
                    }
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                    unit === u ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <input
              id="first-line-length-input"
              type="number"
              inputMode="decimal"
              step="any"
              autoFocus
              value={rawValue}
              onChange={(e) => {
                setRawValue(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={unit === 'm' ? 'e.g. 14.20' : 'e.g. 14200'}
              className="w-full min-h-[48px] bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-2xl pl-4 pr-14 text-lg font-mono font-black text-white tabular-nums focus:outline-hidden"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400 pointer-events-none">
              {unit}
            </span>
          </div>

          {parsedMetres && unit === 'mm' && (
            <div className="text-[11px] font-mono text-sky-300 tabular-nums px-1">
              = {parsedMetres.toFixed(2)} m
            </div>
          )}
          {parsedMetres && unit === 'm' && parseFloat(rawValue) >= 100 && (
            <button
              type="button"
              onClick={() => setUnit('mm')}
              className="text-[11px] text-amber-300 hover:text-amber-200 font-semibold px-1 cursor-pointer"
            >
              Did you mean {rawValue} mm ({(parseFloat(rawValue) / 1000).toFixed(2)} m)? Tap to switch to mm
            </button>
          )}
        </div>

        {/* Quick Preset Chips */}
        <div className="flex flex-wrap gap-1.5">
          {quickPresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setRawValue(preset);
                setErrorMsg(null);
              }}
              className="min-h-[36px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-bold text-slate-200 cursor-pointer tabular-nums"
            >
              {preset}
              {unit}
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="text-xs font-bold text-rose-300 bg-rose-950/50 border border-rose-800/70 rounded-xl px-3 py-2">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onUndoSecondPoint}
            className="min-h-[46px] px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo Point 2</span>
          </button>
          <button
            type="submit"
            disabled={!parsedMetres}
            className="flex-1 min-h-[46px] px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
          >
            <Check className="w-4 h-4" />
            <span>Lock Scale &amp; Continue</span>
          </button>
        </div>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. 2-POINT ARCHITECTURAL PLAN CALIBRATION MODAL
// ---------------------------------------------------------------------------

interface TwoPointScaleModalProps {
  isOpen: boolean;
  mode: 'plan' | 'outline';
  planName?: string;
  currentMeasuredSpanM?: number;
  onRepickPoints: () => void;
  onCancel: () => void;
  onConfirmKnownDistanceM: (distanceM: number) => void;
}

export const TwoPointScaleModal: React.FC<TwoPointScaleModalProps> = ({
  isOpen,
  mode,
  planName,
  currentMeasuredSpanM,
  onRepickPoints,
  onCancel,
  onConfirmKnownDistanceM
}) => {
  const [unit, setUnit] = useState<'m' | 'mm'>('m');
  const [rawValue, setRawValue] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRawValue('');
      setErrorMsg(null);
      setUnit('m');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parsedMetres = parseDistanceInputToMetres(rawValue, unit);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!parsedMetres) {
      setErrorMsg(
        unit === 'm'
          ? 'Enter a valid known distance in metres (e.g. 14.40)'
          : 'Enter a valid known distance in millimetres (e.g. 14400)'
      );
      return;
    }
    onConfirmKnownDistanceM(parsedMetres);
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="two-point-scale-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md bg-[#0b101d] border border-amber-500/40 text-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <h3 id="two-point-scale-title" className="text-base font-extrabold text-white">
                {mode === 'plan' ? '2-Point Plan Scale Calibration' : '2-Point Roof Rescale'}
              </h3>
              <p className="text-xs text-slate-400 truncate max-w-[260px]">
                {planName
                  ? `${planName} · Enter exact distance between Points A & B`
                  : 'Enter exact distance between Point 1 and Point 2'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
            aria-label="Cancel calibration"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3.5 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
          <span className="font-mono text-amber-300 font-bold">
            Point A ———— {parsedMetres ? `${parsedMetres.toFixed(2)} m` : '?'} ———— Point B
          </span>
          {currentMeasuredSpanM && currentMeasuredSpanM > 0 && (
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              Current: {currentMeasuredSpanM.toFixed(2)}m
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="two-point-dist-input" className="text-xs font-bold text-slate-300">
              Known Plan Dimension
            </label>
            <div className="flex items-center p-0.5 rounded-xl bg-slate-950 border border-slate-800">
              {(['m', 'mm'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    if (u !== unit) {
                      const num = parseFloat(rawValue);
                      if (Number.isFinite(num) && num > 0) {
                        setRawValue(
                          u === 'mm' ? String(Math.round(num * 1000)) : String(+(num / 1000).toFixed(3))
                        );
                      }
                      setUnit(u);
                      setErrorMsg(null);
                    }
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                    unit === u ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <input
              id="two-point-dist-input"
              type="number"
              inputMode="decimal"
              step="any"
              autoFocus
              value={rawValue}
              onChange={(e) => {
                setRawValue(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={unit === 'm' ? 'e.g. 14.40' : 'e.g. 14400'}
              className="w-full min-h-[48px] bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-2xl pl-4 pr-14 text-lg font-mono font-black text-white tabular-nums focus:outline-hidden"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400 pointer-events-none">
              {unit}
            </span>
          </div>

          {parsedMetres && unit === 'mm' && (
            <div className="text-[11px] font-mono text-sky-300 tabular-nums px-1">
              = {parsedMetres.toFixed(2)} m
            </div>
          )}
          {parsedMetres && unit === 'm' && parseFloat(rawValue) >= 100 && (
            <button
              type="button"
              onClick={() => setUnit('mm')}
              className="text-[11px] text-amber-300 hover:text-amber-200 font-semibold px-1 cursor-pointer"
            >
              Did you mean {rawValue} mm ({(parseFloat(rawValue) / 1000).toFixed(2)} m)? Tap to switch to mm
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(unit === 'm' ? ['5', '10', '12', '14.4', '18', '24'] : ['5000', '10000', '14400', '18000']).map(
            (preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setRawValue(preset);
                  setErrorMsg(null);
                }}
                className="min-h-[36px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-bold text-slate-200 cursor-pointer tabular-nums"
              >
                {preset}
                {unit}
              </button>
            )
          )}
        </div>

        {errorMsg && (
          <div className="text-xs font-bold text-rose-300 bg-rose-950/50 border border-rose-800/70 rounded-xl px-3 py-2">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onRepickPoints}
            className="min-h-[46px] px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Repick Points</span>
          </button>
          <button
            type="submit"
            disabled={!parsedMetres}
            className="flex-1 min-h-[46px] px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
          >
            <Check className="w-4 h-4" />
            <span>Set Scale &amp; Draw</span>
          </button>
        </div>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. LOAD ARCHITECTURAL PLAN SHEET & BACKDROP CONTROLS MODAL
// ---------------------------------------------------------------------------

interface LoadArchitecturalPlanModalProps {
  isOpen: boolean;
  currentUnderlay: RoofPlanUnderlay | null;
  projectPlans: ArchitecturalPlan[];
  onClose: () => void;
  onLoadNewPlan: (underlay: RoofPlanUnderlay, startCalibrationImmediately: boolean) => void;
  onUpdateUnderlaySettings: (updates: Partial<RoofPlanUnderlay>) => void;
  onStartTwoPointScale: () => void;
  onRemovePlan: () => void;
}

function measureImageDimensions(src: string): Promise<{ width: number; height: number; aspectRatio: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1200;
      const h = img.naturalHeight || 850;
      resolve({ width: w, height: h, aspectRatio: w > 0 && h > 0 ? w / h : 1.414 });
    };
    img.onerror = () => resolve({ width: 1200, height: 850, aspectRatio: 1.414 });
    img.src = src;
  });
}

async function compressPlanImageIfNeeded(dataUrl: string, mimeType: string): Promise<{ url: string; aspectRatio: number }> {
  const dims = await measureImageDimensions(dataUrl);
  if (mimeType === 'image/svg+xml' || Math.max(dims.width, dims.height) <= 2200) {
    return { url: dataUrl, aspectRatio: dims.aspectRatio };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 2200;
      const scale = maxDim / Math.max(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ url: dataUrl, aspectRatio: dims.aspectRatio });
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({
        url: canvas.toDataURL('image/jpeg', 0.86),
        aspectRatio: dims.aspectRatio
      });
    };
    img.onerror = () => resolve({ url: dataUrl, aspectRatio: dims.aspectRatio });
    img.src = dataUrl;
  });
}

export const LoadArchitecturalPlanModal: React.FC<LoadArchitecturalPlanModalProps> = ({
  isOpen,
  currentUnderlay,
  projectPlans,
  onClose,
  onLoadNewPlan,
  onUpdateUnderlaySettings,
  onStartTwoPointScale,
  onRemovePlan
}) => {
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  if (!isOpen) return null;

  const availableProjectSheets =
    projectPlans.length > 0
      ? projectPlans
      : SAMPLE_PROJECT_PLANS.filter((p) => p.category === 'Roof Plan' || p.sheetNumber.startsWith('RC'));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoadingFile(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        const prepared = await compressPlanImageIfNeeded(dataUrl, file.type);
        const spec = createPlanUnderlaySpec({
          name: file.name.replace(/\.[^.]+$/, ''),
          imageUrl: prepared.url,
          aspectRatio: prepared.aspectRatio
        });
        setIsLoadingFile(false);
        onLoadNewPlan(spec, true);
        onClose();
      } else {
        setIsLoadingFile(false);
      }
    };
    reader.onerror = () => setIsLoadingFile(false);
    reader.readAsDataURL(file);
  };

  const handleSelectProjectPlan = async (plan: ArchitecturalPlan) => {
    setIsLoadingFile(true);
    const dims = await measureImageDimensions(plan.fileUrl);
    const spec = createPlanUnderlaySpec({
      name: `${plan.sheetNumber} · ${plan.title}`,
      imageUrl: plan.fileUrl,
      aspectRatio: dims.aspectRatio,
      planId: plan.id
    });
    setIsLoadingFile(false);
    onLoadNewPlan(spec, true);
    onClose();
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-arch-plan-title"
    >
      <div className="w-full sm:max-w-lg bg-[#0b101d] border border-slate-700 text-white rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden max-h-[90dvh] pb-[env(safe-area-inset-bottom)]">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center">
              <FileImage className="w-4 h-4" />
            </div>
            <div>
              <h3 id="load-arch-plan-title" className="text-sm sm:text-base font-extrabold text-white">
                Architectural Plan &amp; 2-Point Scale
              </h3>
              <p className="text-[11px] text-slate-400">
                Load a plan image, calibrate 2 known points, then trace roof freely
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            aria-label="Close Plan Sheet Loader"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Active Plan Controls */}
          {currentUnderlay && (
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-white truncate">{currentUnderlay.name}</div>
                  <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
                    {currentUnderlay.isCalibrated ? (
                      <span className="text-emerald-400 font-bold">
                        Calibrated (Ref {currentUnderlay.calibratedDistanceM?.toFixed(2)}m · Sheet{' '}
                        {currentUnderlay.worldWidthM.toFixed(1)}×{currentUnderlay.worldHeightM.toFixed(1)}m)
                      </span>
                    ) : (
                      <span className="text-amber-300 font-bold">Uncalibrated · Pick 2 points to set scale</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateUnderlaySettings({ visible: currentUnderlay.visible === false })
                  }
                  className="min-h-[36px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {currentUnderlay.visible === false ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Hidden</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Shown</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-slate-400 shrink-0">Opacity</span>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={currentUnderlay.opacity ?? 0.72}
                  onChange={(e) =>
                    onUpdateUnderlaySettings({ opacity: parseFloat(e.target.value) })
                  }
                  className="flex-1 accent-amber-400 cursor-pointer"
                />
                <span className="text-[11px] font-mono text-slate-300 w-9 text-right tabular-nums">
                  {Math.round((currentUnderlay.opacity ?? 0.72) * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartTwoPointScale();
                  }}
                  className="flex-1 min-h-[42px] px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ruler className="w-3.5 h-3.5" />
                  <span>{currentUnderlay.isCalibrated ? 'Re-Calibrate (2-Point)' : 'Set Scale (2-Point)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRemovePlan();
                    onClose();
                  }}
                  className="min-h-[42px] px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          )}

          {/* Upload Custom Architectural Plan Image */}
          <label className="block p-4 rounded-2xl border-2 border-dashed border-sky-500/40 hover:border-sky-400 bg-sky-950/20 hover:bg-sky-950/35 transition-colors cursor-pointer text-center space-y-1.5">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-300 flex items-center justify-center mx-auto">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-xs font-extrabold text-white">
              {isLoadingFile ? 'Preparing plan image...' : 'Upload Architectural Plan Sheet'}
            </div>
            <div className="text-[11px] text-slate-400">
              PNG, JPG, WebP, or CAD SVG · Automatically launches 2-Point Scale calibration
            </div>
            <input
              type="file"
              accept="image/*,.svg"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* Project / Sample Architectural Sheets */}
          {availableProjectSheets.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>{projectPlans.length > 0 ? 'Project Plan Sheets' : 'Sample Architectural Plan Sheet'}</span>
              </div>
              <div className="space-y-1.5">
                {availableProjectSheets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProjectPlan(p)}
                    className="w-full min-h-[48px] p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white overflow-hidden border border-slate-700 shrink-0 flex items-center justify-center">
                        <img
                          src={p.fileUrl}
                          alt={p.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-white truncate">
                          {p.sheetNumber} · {p.title}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {p.category} {p.scale ? `· ${p.scale}` : ''}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-extrabold shrink-0">
                      Load &amp; Scale
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
