import React, { useState } from 'react';
import { AlertTriangle, Check, FileText, Upload, X } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import r01FixturePdfUrl from './fixtures/ApexMap_TestPlan_R01.pdf?url';
import { readVectorPdf } from './readVectorPdf';
import { importEnvelopeIntent, type ImportedEnvelopeModel } from './importToApexMap';
import type { EnvelopeIntent } from './types';

interface PlanTriageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (imported: ImportedEnvelopeModel, intent: EnvelopeIntent) => void;
}

const EDGE_LABELS = ['South', 'East', 'North', 'West'];

export const PlanTriageModal: React.FC<PlanTriageModalProps> = ({
  isOpen,
  onClose,
  onConfirmImport
}) => {
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [intent, setIntent] = useState<EnvelopeIntent | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const primaryBody = intent?.bodies[0] ?? null;
  const bodyBounds = React.useMemo(() => {
    if (!primaryBody || primaryBody.outline.length === 0) return null;
    const xs = primaryBody.outline.map((p) => p.x);
    const ys = primaryBody.outline.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX,
      minY,
      maxY,
      widthM: +(maxX - minX).toFixed(3),
      heightM: +(maxY - minY).toFixed(3)
    };
  }, [primaryBody]);

  if (!isOpen) return null;

  const parseBuffer = async (bytes: Uint8Array, label: string) => {
    setIsReading(true);
    setReadError(null);
    setSourceName(label);
    try {
      const extracted = await readVectorPdf(bytes, { workerSrc: pdfWorkerUrl });
      setIntent(extracted);
    } catch (err) {
      setIntent(null);
      setReadError(err instanceof Error ? err.message : 'Unable to read vector PDF.');
    } finally {
      setIsReading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await parseBuffer(new Uint8Array(buffer), file.name);
    e.target.value = '';
  };

  const handleLoadFixtureR01 = async () => {
    setIsReading(true);
    setReadError(null);
    try {
      const response = await fetch(r01FixturePdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch R01 fixture PDF (${response.status}).`);
      }
      const buffer = await response.arrayBuffer();
      await parseBuffer(new Uint8Array(buffer), 'ApexMap_TestPlan_R01.pdf');
    } catch (err) {
      setIsReading(false);
      setIntent(null);
      setReadError(err instanceof Error ? err.message : 'Unable to load R01 fixture PDF.');
    }
  };

  const handleConfirm = () => {
    if (!intent || intent.blockers.length > 0 || intent.bodies.length === 0) return;
    const imported = importEnvelopeIntent(intent);
    onConfirmImport(imported, intent);
    onClose();
  };

  const canConfirm = Boolean(
    !isReading &&
      !readError &&
      intent &&
      intent.blockers.length === 0 &&
      intent.bodies.length > 0
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 text-slate-100 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-sky-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">Plan Triage</h3>
              <p className="text-xs text-slate-400 truncate">
                Reads vector PDF metadata, outline &amp; manual ridge before canvas import
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Plan Triage"
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Controls */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload PDF</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={handleLoadFixtureR01}
              disabled={isReading}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Load fixture R01
            </button>
          </div>
          {sourceName && (
            <span className="text-xs text-slate-400 font-mono truncate max-w-[240px]">
              {sourceName}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {isReading && (
            <div className="py-10 text-center text-slate-400">
              Reading page 1 vector text and lines...
            </div>
          )}

          {!isReading && readError && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/70 text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-rose-100">PDF Read Failed</div>
                <div className="text-rose-200/90">{readError}</div>
              </div>
            </div>
          )}

          {!isReading && !readError && !intent && (
            <div className="py-8 px-4 border border-dashed border-slate-800 rounded-xl text-center space-y-2">
              <div className="text-sm font-semibold text-slate-200">No plan loaded</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Upload a vector architectural roof plan PDF or load the committed R01 fixture to inspect scale, outline geometry, edge modes, and flashing hints before importing.
              </p>
            </div>
          )}

          {!isReading && intent && (
            <>
              {/* Blockers Banner (Red) */}
              {intent.blockers.length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-950/75 border border-rose-500 text-rose-100 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-rose-200">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Import blocked ({intent.blockers.length})</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-200">
                    {intent.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Metadata Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-[11px] text-slate-400">Scale</div>
                  <div className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                    {intent.scale ?? 'Missing'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Profile</div>
                  <div className="text-sm font-semibold text-white mt-0.5 capitalize">
                    {intent.profileFamily ? intent.profileFamily.replace('_', ' ') : 'Unspecified'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Wind Zone</div>
                  <div className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                    {intent.windZone ?? 'Unspecified'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Vented Ridge</div>
                  <div className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                    {intent.ventedRidge ?? 'Unspecified'}
                  </div>
                </div>
              </div>

              {/* Primary Body Geometry & Edges */}
              {primaryBody && bodyBounds && (
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-5 items-start">
                  <div className="sm:col-span-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3 border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-[11px] text-slate-400">Outline Size</div>
                        <div className="font-mono tabular-nums font-semibold text-white mt-0.5">
                          {bodyBounds.widthM.toFixed(1)} m × {bodyBounds.heightM.toFixed(1)} m
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">Pitch</div>
                        <div className="font-mono tabular-nums font-semibold text-white mt-0.5">
                          {primaryBody.pitchDeg !== null ? `${primaryBody.pitchDeg}°` : 'Unspecified'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">Eave Height</div>
                        <div className="font-mono tabular-nums font-semibold text-white mt-0.5">
                          {intent.eaveHeightM !== undefined && intent.eaveHeightM !== null
                            ? `${intent.eaveHeightM.toFixed(2)} m`
                            : 'Unspecified'}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] text-slate-400">Perimeter Edges (CCW)</div>
                      <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-lg">
                        {primaryBody.edges.map((edge, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-1.5 flex items-center justify-between text-xs"
                          >
                            <span className="text-slate-300">
                              {EDGE_LABELS[idx] ?? `Edge ${idx + 1}`}
                            </span>
                            <span className="font-mono tabular-nums text-white capitalize">
                              {edge.type}
                              {edge.eaveHeightM !== undefined ? ` · ${edge.eaveHeightM.toFixed(2)} m` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {primaryBody.skeleton.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-400">Manual Skeleton Lines</div>
                        {primaryBody.skeleton.map((s, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between font-mono tabular-nums text-[11px]"
                          >
                            <span className="text-sky-300 uppercase">{s.type}</span>
                            <span className="text-slate-300">
                              ({s.from.x.toFixed(1)}, {s.from.y.toFixed(1)}) → ({s.to.x.toFixed(1)}, {s.to.y.toFixed(1)})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Clean Schematic Preview */}
                  <div className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center">
                    <svg
                      viewBox={`-1 -1 ${Math.max(1, bodyBounds.widthM) + 2} ${Math.max(1, bodyBounds.heightM) + 2}`}
                      className="w-full h-36"
                    >
                      {/* Flip Y so North points up */}
                      <g transform={`translate(0, ${bodyBounds.heightM}) scale(1, -1)`}>
                        <polygon
                          points={primaryBody.outline.map((p) => `${p.x},${p.y}`).join(' ')}
                          fill="rgba(56, 189, 248, 0.08)"
                          stroke="#38bdf8"
                          strokeWidth="0.16"
                        />
                        {primaryBody.skeleton.map((s, idx) => (
                          <line
                            key={idx}
                            x1={s.from.x}
                            y1={s.from.y}
                            x2={s.to.x}
                            y2={s.to.y}
                            stroke="#f59e0b"
                            strokeWidth="0.16"
                            strokeDasharray="0.4 0.25"
                          />
                        ))}
                      </g>
                    </svg>
                    <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1">
                      North up · {primaryBody.holes.length} holes · {intent.openings.length} openings
                    </div>
                  </div>
                </div>
              )}

              {/* Flashing Hints */}
              <div className="border-t border-slate-800 pt-3.5 space-y-1.5">
                <div className="text-[11px] text-slate-400">Flashing Hints</div>
                {intent.flashingHints.length > 0 ? (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg">
                    {intent.flashingHints.map((hint, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-mono font-semibold text-white">
                          {hint.detail} · {hint.kind}
                        </span>
                        <span className="font-mono tabular-nums text-slate-300">
                          {hint.coverMm !== null ? `Cover ${hint.coverMm} mm` : 'Cover n/a'}
                          {' · '}
                          {hint.ventedRidge === 'RV10P' ? 'RV10P' : 'Std ridge'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400">No flashing detail boxes detected.</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Confirm &amp; Import</span>
          </button>
        </div>
      </div>
    </div>
  );
};
