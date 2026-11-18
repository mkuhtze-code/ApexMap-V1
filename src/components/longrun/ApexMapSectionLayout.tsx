import React, { useState, useMemo } from 'react';
import { Project } from '../../types/crm';
import { RoofFacet, LongRunProfileKey } from '../../types/longrun';
import {
  RoofSectionDef,
  SectionConnector,
  SectionSettingsConfig,
  SectionEngineStats,
  GroupedCutListItem,
  LayDirection
} from '../../types/sections';
import {
  DEFAULT_SECTION_SETTINGS,
  generateSectionLayout
} from '../../utils/sectionLayoutEngine';
import { SectionSettingsModal } from './SectionSettingsModal';
import { SectionEditModal } from './SectionEditModal';
import { SectionCutListDrawer } from './SectionCutListDrawer';
import {
  Settings2,
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Layers,
  Check
} from 'lucide-react';

interface Props {
  project?: Project;
  facets?: RoofFacet[];
  onUpdateFacets?: (facets: RoofFacet[]) => void;
  profileKey?: LongRunProfileKey;
  gauge?: string;
  colorName?: string;
  onSaveToProject?: (facets: RoofFacet[]) => void;
  onOpenCadView?: () => void;
}

export const ApexMapSectionLayout: React.FC<Props> = ({
  project,
  facets,
  onUpdateFacets,
  profileKey = 'corrugate_762',
  gauge = '0.55mm',
  colorName = 'FlaxPod',
  onSaveToProject,
  onOpenCadView
}) => {
  // Settings & Configuration
  const [settings, setSettings] = useState<SectionSettingsConfig>(DEFAULT_SECTION_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isCutListOpen, setIsCutListOpen] = useState<boolean>(false);

  // Section Overrides (Pitch, Lay Direction per section)
  const [sectionOverrides, setSectionOverrides] = useState<
    Record<string, { pitchDeg?: number; layDirection?: LayDirection; name?: string }>
  >({});

  // Active Selected Section for Quick-Edit Drawer
  const [selectedSection, setSelectedSection] = useState<RoofSectionDef | null>(null);

  // Toggle Chips State
  const [showLengths, setShowLengths] = useState<boolean>(false);
  const [showPitch, setShowPitch] = useState<boolean>(false);
  const [showOffcutLinks, setShowOffcutLinks] = useState<boolean>(true);
  const [showPurlins, setShowPurlins] = useState<boolean>(false);

  // Layout Generation & Refresh Animation
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Generate Current Section Model
  const layout = useMemo(() => {
    return generateSectionLayout(settings, sectionOverrides);
  }, [settings, sectionOverrides]);

  const { sections, connectors, stats, cutList } = layout;

  // Handle Trigger "Generate Layout"
  const handleGenerateLayout = () => {
    setIsRecalculating(true);
    setTimeout(() => {
      setIsRecalculating(false);
      setSaveToast('✓ Section layout & offcut pairings recalculated');
      setTimeout(() => setSaveToast(null), 3000);
    }, 350);
  };

  // Handle Section Override Save from Quick-Edit Modal
  const handleSaveSectionOverride = (
    sectionId: string,
    updates: { pitchDeg: number; layDirection: LayDirection; name?: string }
  ) => {
    setSectionOverrides((prev) => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        ...updates
      }
    }));
    setSaveToast(`✓ Updated ${updates.name || 'Section'} (Pitch ${updates.pitchDeg}°, ${updates.layDirection})`);
    setTimeout(() => setSaveToast(null), 3000);
  };

  const currentPresetTitle =
    settings.roofOutlinePreset === 'rectangular_hip'
      ? 'Rectangular 4-Face Hip'
      : settings.roofOutlinePreset === 'straight_gable'
      ? 'Duo-Pitch Straight Gable'
      : 'L-Shape Hip & Valley';

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 font-sans pb-8 select-none">
      {/* Toast Notification */}
      {saveToast && (
        <div className="bg-emerald-950 text-emerald-200 border border-emerald-700/80 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{saveToast}</span>
          </div>
          <button onClick={() => setSaveToast(null)} className="text-emerald-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* 1. TOP HEADER CARD (Matches UI reference top card) */}
      <div className="bg-[#1b2434] border border-[#26354a] rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-lg">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>ApexMap</span>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
              v3.0 Lean
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">
            {currentPresetTitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCutListOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#253247] hover:bg-[#2d3d56] border border-[#374966] text-xs font-bold text-slate-200 transition-all cursor-pointer shadow-xs"
            title="View Grouped Roll-Former Order Table"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Cut List</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#253247] hover:bg-[#2d3d56] border border-[#374966] text-xs font-bold text-slate-200 transition-all cursor-pointer shadow-xs"
          >
            <Settings2 className="w-4 h-4 text-slate-300" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* 2. STATS BAR (Matches exact 4-metric strip from reference image) */}
      <div className="bg-[#1b2434] border border-[#26354a] rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="grid grid-cols-4 gap-2 text-left">
          {/* Saved */}
          <div>
            <div className="text-lg sm:text-2xl font-mono font-extrabold text-[#38bdf8] leading-tight">
              +{stats.metresSaved} m
            </div>
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5">Saved</div>
          </div>

          {/* Utilisation */}
          <div>
            <div className="text-lg sm:text-2xl font-mono font-extrabold text-[#38bdf8] leading-tight">
              {stats.utilisationPercent}%
            </div>
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5">Utilisation</div>
          </div>

          {/* Offcuts */}
          <div>
            <div className="text-lg sm:text-2xl font-mono font-extrabold text-[#38bdf8] leading-tight">
              {stats.offcutsCount}
            </div>
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5">Offcuts</div>
          </div>

          {/* Value */}
          <div>
            <div className="text-lg sm:text-2xl font-mono font-extrabold text-[#38bdf8] leading-tight">
              ${stats.estimatedValueNZD}
            </div>
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5">Value</div>
          </div>
        </div>
      </div>

      {/* 3. MAIN PLAN VIEW CANVAS CARD (Matches UI_Visual_Reference_Sections_5281fee2.png) */}
      <div className="bg-[#1b2434] border border-[#26354a] rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        {/* Helper Tip for Tradesman */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3 px-1">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Tap any section to adjust pitch or lay direction
          </span>
          <span className="font-mono text-[10px] text-slate-500 hidden sm:inline">
            Cover: {settings.coverWidthM * 1000}mm · Overhang: {settings.eaveOverhangM * 1000}mm
          </span>
        </div>

        {/* SVG Canvas Container */}
        <div className="relative w-full aspect-[4/3] max-h-[560px] bg-[#16202c] rounded-2xl border border-[#233144] overflow-hidden flex items-center justify-center p-2 sm:p-4">
          <svg
            viewBox="0 0 850 780"
            className="w-full h-full object-contain filter drop-shadow-md transition-all duration-300"
          >
            <defs>
              {/* Subtle Hatching for "Lengths" toggle */}
              <pattern
                id="sheetFlutes"
                width="14"
                height="14"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(0)"
              >
                <line x1="0" y1="0" x2="0" y2="14" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.18" />
              </pattern>

              {/* Purlin Grid pattern */}
              <pattern
                id="purlinGrid"
                width="60"
                height="60"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="60" y2="0" stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.35" strokeDasharray="3 3" />
              </pattern>
            </defs>

            {/* Background Purlin Grid if enabled */}
            {showPurlins && (
              <rect x="50" y="50" width="750" height="680" fill="url(#purlinGrid)" />
            )}

            {/* SECTIONS RENDER */}
            {sections.map((sec) => {
              const isSelected = selectedSection?.id === sec.id;
              return (
                <g
                  key={sec.id}
                  onClick={() => setSelectedSection(sec)}
                  className="cursor-pointer group transition-transform duration-200"
                >
                  {/* Solid Section Polygon Fill */}
                  <polygon
                    points={sec.svgPoints}
                    fill={sec.color}
                    fillOpacity="0.96"
                    stroke={isSelected ? '#ffffff' : '#16202c'}
                    strokeWidth={isSelected ? '4' : '2'}
                    className="transition-all duration-200 group-hover:brightness-110"
                  />

                  {/* Sheet Flutes / Hatching if Lengths toggle is active */}
                  {showLengths && (
                    <polygon
                      points={sec.svgPoints}
                      fill="url(#sheetFlutes)"
                      pointerEvents="none"
                    />
                  )}

                  {/* Section Label (Bold Centred Text matching screenshot) */}
                  <text
                    x={sec.centerTextX}
                    y={sec.centerTextY - 6}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="17"
                    fontWeight="800"
                    fontFamily="sans-serif"
                    className="pointer-events-none select-none tracking-wide"
                  >
                    {sec.label}
                  </text>

                  {/* Subtitle (e.g. "Main Run 6.0m", "East Hip", "West Valley") */}
                  <text
                    x={sec.centerTextX}
                    y={sec.centerTextY + 16}
                    textAnchor="middle"
                    fill="#ffffff"
                    fillOpacity="0.88"
                    fontSize="11.5"
                    fontWeight="500"
                    fontFamily="sans-serif"
                    className="pointer-events-none select-none"
                  >
                    {sec.subtitle}
                  </text>

                  {/* Pitch Badge if Pitch toggle is on */}
                  {showPitch && (
                    <g transform={`translate(${sec.centerTextX}, ${sec.centerTextY + 36})`}>
                      <rect
                        x="-24"
                        y="-10"
                        width="48"
                        height="18"
                        rx="9"
                        fill="#0f172a"
                        fillOpacity="0.85"
                        stroke="#38bdf8"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fill="#38bdf8"
                        fontSize="9.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {sec.pitchDeg}° {sec.layDirection}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* CONNECTORS & OFFCUT TRANSFER LINKS (Matching screenshot labels) */}
            {showOffcutLinks &&
              connectors.map((conn) => (
                <g key={conn.id} className="pointer-events-none">
                  {/* White Indicator Bar across boundary */}
                  <line
                    x1={conn.startX}
                    y1={conn.startY}
                    x2={conn.endX}
                    y2={conn.endY}
                    stroke="#ffffff"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="drop-shadow-sm"
                  />

                  {/* Connector Text Label */}
                  <text
                    x={conn.midX}
                    y={conn.midY}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="sans-serif"
                    className="drop-shadow-md select-none"
                  >
                    {conn.labelText}
                  </text>
                </g>
              ))}
          </svg>
        </div>

        {/* LEGEND CONTAINER (Matches UI reference bottom box) */}
        <div className="mt-4 bg-[#141b25] border border-[#222d3d] rounded-xl p-3 sm:p-4 text-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            LEGEND
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            {sections
              .filter((s) => s.role !== 'receiver' || s.code === 'B')
              .map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-sm shrink-0 shadow-xs"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-semibold text-slate-200 text-xs">
                    {s.code === 'A'
                      ? 'Blue A – Main Run'
                      : s.code === 'B'
                      ? 'Green B – East Hip'
                      : 'Orange C – Valley'}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* 4. TOGGLE CHIPS ROW (Lengths • Pitch • Offcut Links • Purlins) */}
      <div className="bg-[#1b2434] border border-[#26354a] rounded-2xl p-3 shadow-md flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowLengths(!showLengths)}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            showLengths
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-[#253247] hover:bg-[#2d3d56] text-slate-300'
          }`}
        >
          Lengths
        </button>

        <button
          onClick={() => setShowPitch(!showPitch)}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            showPitch
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-[#253247] hover:bg-[#2d3d56] text-slate-300'
          }`}
        >
          Pitch
        </button>

        <button
          onClick={() => setShowOffcutLinks(!showOffcutLinks)}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            showOffcutLinks
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-[#253247] hover:bg-[#2d3d56] text-slate-300'
          }`}
        >
          Offcut Links
        </button>

        <button
          onClick={() => setShowPurlins(!showPurlins)}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            showPurlins
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-[#253247] hover:bg-[#2d3d56] text-slate-300'
          }`}
        >
          Purlins
        </button>
      </div>

      {/* 5. BIG PRIMARY BUTTON: GENERATE LAYOUT */}
      <div className="space-y-2 pt-1">
        <button
          onClick={handleGenerateLayout}
          disabled={isRecalculating}
          className="w-full py-4 rounded-2xl bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.99] text-white font-extrabold text-base sm:text-lg shadow-xl shadow-blue-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          {isRecalculating ? (
            <>
              <RotateCcw className="w-5 h-5 animate-spin" />
              <span>Optimizing Layout &amp; Pairings...</span>
            </>
          ) : (
            <span>Generate Layout</span>
          )}
        </button>

        {/* Subtext caption matching spec */}
        <p className="text-center text-xs text-slate-400 font-medium px-2">
          Sections are the primary unit. Individual sheets only appear in the Cut List.
        </p>
      </div>

      {/* MODALS & DRAWERS */}
      {/* 1. Settings Portal */}
      <SectionSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => {
          setSettings(newSettings);
          setSaveToast('✓ Settings applied to layout engine');
          setTimeout(() => setSaveToast(null), 3000);
        }}
      />

      {/* 2. Section Quick-Edit Drawer */}
      <SectionEditModal
        section={selectedSection}
        isOpen={!!selectedSection}
        onClose={() => setSelectedSection(null)}
        onSave={handleSaveSectionOverride}
      />

      {/* 3. Grouped Roll-Former Cut List Drawer */}
      <SectionCutListDrawer
        isOpen={isCutListOpen}
        onClose={() => setIsCutListOpen(false)}
        cutList={cutList}
        stats={stats}
        projectName={project?.title || 'Residential Long-Run Roof'}
      />
    </div>
  );
};
