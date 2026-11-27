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
const PRESET_SCALES = [50, 100, 200] as const;

function getGuidanceCopy(role?: string | null): string {
  if (role === 'site') {
    return 'Site plans have no roof outline. Choose the floor or roof plan page, or set the scale if it is only drawn in the title block.';
  }
  if (role === 'details') {
    return 'Details sheets have no roof outline. Choose the floor or roof plan page, or set the scale if it is only drawn in the title block.';
  }
  return 'This sheet has no matching roof outline. Choose the floor or roof plan page, or check the scale.';
}

function formatRoleLabel(role: string): string {
  switch (role) {
    case 'site':
      return 'Site';
    case 'floor':
      return 'Floor';
    case 'roof':
      return 'Roof';
    case 'elevation':
      return 'Elev';
    case 'details':
      return 'Details';
    default:
      return 'Other';
  }
}

function getRoleBadgeStyle(role: string): string {
  switch (role) {
    case 'roof':
      return 'bg-emerald-950/80 border-emerald-600/50 text-emerald-300';
    case 'floor':
      return 'bg-sky-950/80 border-sky-600/50 text-sky-300';
    case 'elevation':
      return 'bg-indigo-950/70 border-indigo-500/40 text-indigo-300';
    case 'site':
      return 'bg-amber-950/70 border-amber-600/40 text-amber-300';
    case 'details':
      return 'bg-slate-800 border-slate-700 text-slate-300';
    default:
      return 'bg-slate-800 border-slate-700 text-slate-400';
  }
}

export const PlanTriageModal: React.FC<PlanTriageModalProps> = ({
  isOpen,
  onClose,
  onConfirmImport
}) => {
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | undefined>(undefined);
  const [manualScaleDenom, setManualScaleDenom] = useState<number | undefined>(undefined);
  const [customScaleInput, setCustomScaleInput] = useState<string>('');
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

  const parseBuffer = async (
    bytes: Uint8Array,
    label: string,
    opts?: { pageNumber?: number; manualScaleDenom?: number }
  ) => {
    setIsReading(true);
    setReadError(null);
    setSourceName(label);
    setPdfBytes(bytes);
    try {
      const extracted = await readVectorPdf(bytes, {
        workerSrc: pdfWorkerUrl,
        ...(opts?.pageNumber !== undefined ? { pageNumber: opts.pageNumber } : {}),
        ...(opts?.manualScaleDenom !== undefined
          ? { manualScaleDenom: opts.manualScaleDenom }
          : {})
      });
      setIntent(extracted);
      setSelectedPage(extracted.selectedPage);
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
    setSelectedPage(undefined);
    setManualScaleDenom(undefined);
    setCustomScaleInput('');
    await parseBuffer(new Uint8Array(buffer), file.name);
    e.target.value = '';
  };

  const handleLoadFixtureR01 = async () => {
    setIsReading(true);
    setReadError(null);
    setSelectedPage(undefined);
    setManualScaleDenom(undefined);
    setCustomScaleInput('');
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

  const handleSelectPage = async (pageNum: number) => {
    if (!pdfBytes || !sourceName) return;
    setSelectedPage(pageNum);
    setManualScaleDenom(undefined);
    setCustomScaleInput('');
    await parseBuffer(pdfBytes, sourceName, { pageNumber: pageNum });
  };

  const handleApplyManualScale = async (denom: number) => {
    if (!pdfBytes || !sourceName || !Number.isFinite(denom) || denom <= 0) return;
    setManualScaleDenom(denom);
    setCustomScaleInput(String(denom));
    await parseBuffer(pdfBytes, sourceName, {
      pageNumber: selectedPage ?? intent?.selectedPage,
      manualScaleDenom: denom
    });
  };

  const handleClearManualScale = async () => {
    if (!pdfBytes || !sourceName) return;
    setManualScaleDenom(undefined);
    setCustomScaleInput('');
    await parseBuffer(pdfBytes, sourceName, {
      pageNumber: selectedPage ?? intent?.selectedPage
    });
  };

  const handleConfirm = () => {
    if (!intent || intent.blockers.length > 0 || intent.bodies.length === 0) return;
    const imported = importEnvelopeIntent(intent);
    onConfirmImport(imported, intent);
    onClose();
  };

  const activePageInfo =
    intent?.pages?.find((p) => p.page === intent.selectedPage) ?? null;
  const recommendedPageInfo =
    intent?.pages?.find(
      (p) =>
        p.page === intent.recommendedPage &&
        (p.role === 'roof' || p.role === 'floor') &&
        p.page !== intent.selectedPage
    ) ??
    intent?.pages?.find(
      (p) => (p.role === 'roof' || p.role === 'floor') && p.page !== intent?.selectedPage
    ) ??
    null;
  const guidanceCopy = getGuidanceCopy(activePageInfo?.role);
  const netRoofAreaMetric =
    intent?.areas?.find((a) => /\bnet\s+roof\s+area\b/i.test(a.label)) ??
    intent?.areas?.find((a) => !/\bsite\b/i.test(a.label)) ??
    null;
  const areaEvidenceNotes =
    intent?.evidence.filter((ev) => /\barea\b/i.test(ev.text) && /\d/.test(ev.text)) ?? [];
  const nonScaleBlockers =
    intent?.blockers.filter((b) => b !== 'missing scale') ?? [];
  const isMissingScale = Boolean(intent && intent.blockers.includes('missing scale'));
  const hasRedBlockers = nonScaleBlockers.length > 0;
  const warnings = intent?.warnings ?? [];
  const customDenomParsed = Number(customScaleInput.trim());
  const isCustomValid = Number.isFinite(customDenomParsed) && customDenomParsed > 0;

  const canConfirm = Boolean(
    !isReading &&
      !readError &&
      intent &&
      intent.scale &&
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
              Reading vector text and lines...
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
                Upload a vector architectural roof plan PDF or load the committed R01 fixture to inspect pages, scale, outline geometry, edge modes, and flashing hints before importing.
              </p>
            </div>
          )}

          {!isReading && intent && (
            <>
              {/* Page Picker (lists every page with role badge and highlights recommended geometry page) */}
              {intent.pages && intent.pages.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Pages ({intent.pageCount ?? intent.pages.length}) — click to switch sheet
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      Reading Page {intent.selectedPage ?? 1}
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/60">
                    {intent.pages.map((p) => {
                      const isActive = p.page === (intent.selectedPage ?? 1);
                      const isRecommended = p.page === intent.recommendedPage;
                      return (
                        <button
                          key={p.page}
                          type="button"
                          onClick={() => handleSelectPage(p.page)}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-sky-950/70 text-white'
                              : isRecommended
                                ? 'bg-emerald-950/25 hover:bg-emerald-950/40 text-slate-100'
                                : 'hover:bg-slate-800/60 text-slate-300'
                          }`}
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-mono tabular-nums text-[11px] font-semibold text-sky-400 shrink-0">
                              Page {p.page}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-mono shrink-0 ${getRoleBadgeStyle(
                                p.role
                              )}`}
                            >
                              {formatRoleLabel(p.role)}
                            </span>
                            <span className="truncate font-medium">{p.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
                            {isRecommended && (
                              <span className="text-emerald-400">Recommended</span>
                            )}
                            {isActive && <span className="text-sky-300">Active</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Missing Scale Required Field (no red wall) */}
              {isMissingScale && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/60 text-slate-100 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-amber-300">Scale not found</span>
                    <span className="text-[11px] font-mono text-amber-400 uppercase">
                      Required
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {PRESET_SCALES.map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        onClick={() => handleApplyManualScale(denom)}
                        className={`px-3 py-1.5 rounded-lg border font-mono tabular-nums text-xs font-semibold cursor-pointer transition-colors ${
                          manualScaleDenom === denom
                            ? 'bg-sky-600 border-sky-400 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        }`}
                      >
                        1:{denom}
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-400">1:</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="Custom"
                        value={customScaleInput}
                        onChange={(e) => setCustomScaleInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && isCustomValid) {
                            handleApplyManualScale(customDenomParsed);
                          }
                        }}
                        aria-label="Custom scale denominator"
                        className="w-20 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono tabular-nums text-xs focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        disabled={!isCustomValid}
                        onClick={() => handleApplyManualScale(customDenomParsed)}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold cursor-pointer disabled:cursor-not-allowed transition-colors"
                      >
                        Set
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Read Page {intent.selectedPage ?? 1} of {intent.pageCount ?? 1}
                    {activePageInfo ? ` (${activePageInfo.title})` : ''}. {guidanceCopy}
                  </p>
                </div>
              )}

              {/* Non-Scale Blockers Banner (Red) */}
              {hasRedBlockers && (
                <div className="p-3.5 rounded-xl bg-rose-950/75 border border-rose-500 text-rose-100 space-y-2.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 font-semibold text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Import blocked ({nonScaleBlockers.length})</span>
                    </div>
                    {recommendedPageInfo && (
                      <button
                        type="button"
                        onClick={() => handleSelectPage(recommendedPageInfo.page)}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
                      >
                        Use {recommendedPageInfo.role === 'roof' ? 'Roof' : 'Floor'} plan (page{' '}
                        {recommendedPageInfo.page})
                      </button>
                    )}
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-200">
                    {nonScaleBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-rose-200/90 leading-relaxed pt-1 border-t border-rose-500/30">
                    Read Page {intent.selectedPage ?? 1} of {intent.pageCount ?? 1}
                    {activePageInfo ? ` (${activePageInfo.title})` : ''}. {guidanceCopy}
                  </p>
                  {intent.scaleSource === 'user' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[11px] text-rose-200">Adjust scale:</span>
                      {PRESET_SCALES.map((denom) => (
                        <button
                          key={denom}
                          type="button"
                          onClick={() => handleApplyManualScale(denom)}
                          className={`px-2 py-1 rounded border font-mono tabular-nums text-[11px] cursor-pointer ${
                            manualScaleDenom === denom
                              ? 'bg-sky-600 border-sky-400 text-white'
                              : 'bg-slate-900/70 border-rose-400/40 text-rose-100 hover:bg-slate-800'
                          }`}
                        >
                          1:{denom}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleClearManualScale}
                        className="px-2 py-1 rounded border border-rose-400/40 text-[11px] text-rose-200 hover:bg-rose-900/50 cursor-pointer"
                      >
                        Reset scale
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Non-Blocking Warnings */}
              {warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/60 text-amber-100 space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Check notes ({warnings.length})</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Synthesized Plan Intelligence Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-[11px] text-slate-400">Scale</div>
                  <div className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                    {intent.scale ?? 'Not found'}
                  </div>
                  {intent.scaleSource && (
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {intent.scaleSource}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Pitch</div>
                  <div className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                    {intent.pitchDeg !== undefined && intent.pitchDeg !== null
                      ? `${intent.pitchDeg}°`
                      : 'Unspecified'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Wind Zone</div>
                  <div className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                    {intent.windZone ?? 'Unspecified'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Net Roof Area</div>
                  <div className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                    {netRoofAreaMetric ? `${netRoofAreaMetric.valueM2.toFixed(1)} m²` : 'Unspecified'}
                  </div>
                  {netRoofAreaMetric && (
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                      p.{netRoofAreaMetric.page} · {netRoofAreaMetric.label}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Confidence</div>
                  <div className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                    {intent.confidence !== undefined
                      ? `${Math.round(intent.confidence * 100)}%`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Profile</div>
                  <div className="text-sm font-semibold text-white mt-0.5 capitalize">
                    {intent.profileFamily ? intent.profileFamily.replace('_', ' ') : 'Unspecified'}
                  </div>
                  {intent.ventedRidge && (
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {intent.ventedRidge}
                    </div>
                  )}
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
                          {bodyBounds.widthM.toFixed(2)} m × {bodyBounds.heightM.toFixed(2)} m
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
                              {primaryBody.edges.length === 4 ? EDGE_LABELS[idx] : `Edge ${idx + 1}`}
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

              {/* Flashing Hints & Area Evidence */}
              <div className="border-t border-slate-800 pt-3.5 space-y-3">
                <div className="space-y-1.5">
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

                {areaEvidenceNotes.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-slate-400">Area Evidence</div>
                    <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 bg-slate-950/60">
                      {areaEvidenceNotes.map((ev, idx) => (
                        <div key={idx} className="px-3 py-1.5 font-mono text-[11px] text-slate-300">
                          Page {ev.page}: {ev.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {intent.heights && intent.heights.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-slate-400">Elevation &amp; Height Notes</div>
                    <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 bg-slate-950/60">
                      {intent.heights.map((h, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-1.5 flex items-center justify-between font-mono tabular-nums text-[11px] text-slate-300"
                        >
                          <span className="uppercase text-slate-200">{h.kind}</span>
                          <span>
                            {h.valueM.toFixed(2)} m · Page {h.page}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
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
