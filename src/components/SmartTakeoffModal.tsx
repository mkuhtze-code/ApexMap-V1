import React, { useState } from 'react';
import { 
  Quote, 
  RoofingProfile, 
  CoilMaterial, 
  WindZone, 
  ExposureZone, 
  ProjectCategory,
  ExistingRoofType,
  SpreadsheetSection, 
  SpreadsheetRow 
} from '../types/crm';
import { 
  MODULAR_COIL_MATERIALS, 
  MODULAR_TRAY_PROFILES 
} from '../utils/pricingMatrix';
import { 
  generateSmartScopeOfWorks, 
  parseArchitectBriefAI, 
  SmartTakeoffInput 
} from '../utils/smartRoofingEngine';
import { formatNZD } from '../utils/formatters';
import { 
  Sparkles, 
  X, 
  Ruler, 
  Wind, 
  Compass, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  ShieldCheck, 
  Layers, 
  Wand2, 
  ArrowRight,
  Droplets,
  HardHat,
  Hammer,
  Home,
  Check
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeQuote: Quote;
  onApplyScope: (sections: SpreadsheetSection[], rows: SpreadsheetRow[], summary: string) => void;
}

export const SmartTakeoffModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeQuote,
  onApplyScope
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'calculator' | 'ai_brief'>('calculator');

  // Category & Re-Roof State
  const [category, setCategory] = useState<ProjectCategory>(
    activeQuote.category || (activeQuote.profile?.includes('Corrugate') ? 'Residential Re-Roof' : 'Architectural Bespoke')
  );
  const [existingRoofType, setExistingRoofType] = useState<ExistingRoofType>(
    activeQuote.existingRoofType || 'Corrugated Iron'
  );
  const [includeScaffoldingEdgeProtection, setIncludeScaffoldingEdgeProtection] = useState<boolean>(true);
  const [includePurlinScrewDown, setIncludePurlinScrewDown] = useState<boolean>(true);

  // Takeoff Input State initialized from active quote
  const [roofAreaM2, setRoofAreaM2] = useState<number>(activeQuote.roofAreaM2 || 220);
  const [pitchDegrees, setPitchDegrees] = useState<number>((activeQuote as any).pitchDegrees || (category === 'Residential Re-Roof' ? 12 : 4));
  const [windZone, setWindZone] = useState<WindZone>(activeQuote.windZone || 'Very High');
  const [exposureZone, setExposureZone] = useState<ExposureZone>(activeQuote.exposureZone || 'Zone D (Severe Marine)');
  const [preferredProfile, setPreferredProfile] = useState<RoofingProfile>(
    activeQuote.profile || (category === 'Residential Re-Roof' ? 'TRS Corrugate 0.55mm' : 'Archtech Super Seam 38mm')
  );
  const [preferredMaterial, setPreferredMaterial] = useState<CoilMaterial>(activeQuote.material || 'The Roofing Store MagnaFlow®');
  const [preferredPanMm, setPreferredPanMm] = useState<number>(preferredProfile.includes('Corrugate') ? 762 : 450);
  const [wallCladdingAreaM2, setWallCladdingAreaM2] = useState<number>(category === 'Architectural Bespoke' ? 50 : 0);
  const [wallProfile, setWallProfile] = useState<RoofingProfile>('Archtech Interlocking Panels');
  const [storeys, setStoreys] = useState<number>(category === 'Residential Re-Roof' ? 1 : 2);
  const [includeRainwater, setIncludeRainwater] = useState<boolean>(true);
  const [targetMarginPercent, setTargetMarginPercent] = useState<number>(category === 'Residential Re-Roof' ? 22 : 20);

  // AI Brief Text State
  const [briefText, setBriefText] = useState<string>(
    `Re-roof enquiry for 142 Richmond Road, Grey Lynn:
Existing weathered corrugated iron roof (approx 190 m² at 15° pitch).
Looking to strip and replace with new 0.55mm TRS Corrugate in Slate Grey / Ebony with new synthetic underlay.
Require perimeter edge protection to comply with WorkSafe NZ, check all timber purlins and re-screw.
Also replace old rusty spouting with new continuous quarter-round gutters and two downpipes.`
  );
  const [isAiParsing, setIsAiParsing] = useState<boolean>(false);
  const [aiParseMessage, setAiParseMessage] = useState<string | null>(null);

  // Handle Category Switch
  const handleCategoryChange = (newCat: ProjectCategory) => {
    setCategory(newCat);
    if (newCat === 'Residential Re-Roof') {
      setPreferredProfile('TRS Corrugate 0.55mm');
      setPreferredPanMm(762);
      setPitchDegrees(12);
      setStoreys(1);
      setWallCladdingAreaM2(0);
      setTargetMarginPercent(22);
    } else if (newCat === 'Architectural Bespoke') {
      setPreferredProfile('Archtech Super Seam 38mm');
      setPreferredPanMm(450);
      setPitchDegrees(4);
      setStoreys(2);
      setWallCladdingAreaM2(60);
      setTargetMarginPercent(20);
    } else if (newCat === 'Commercial / Industrial') {
      setPreferredProfile('TRS Plumbdeck Trapezoidal 0.55mm');
      setPreferredPanMm(760);
      setPitchDegrees(3.5);
      setStoreys(2);
      setTargetMarginPercent(18);
    }
  };

  // Handle AI brief extraction
  const handleAIBriefExtract = async () => {
    if (!briefText.trim()) return;
    setIsAiParsing(true);
    setAiParseMessage(null);
    try {
      const extracted = await parseArchitectBriefAI(briefText);
      if (extracted.category) handleCategoryChange(extracted.category);
      if (extracted.existingRoofType) setExistingRoofType(extracted.existingRoofType);
      if (extracted.roofAreaM2) setRoofAreaM2(extracted.roofAreaM2);
      if (extracted.pitchDegrees !== undefined) setPitchDegrees(extracted.pitchDegrees);
      if (extracted.windZone) setWindZone(extracted.windZone);
      if (extracted.exposureZone) setExposureZone(extracted.exposureZone);
      if (extracted.preferredProfile) setPreferredProfile(extracted.preferredProfile);
      if (extracted.preferredMaterial) setPreferredMaterial(extracted.preferredMaterial);
      if (extracted.wallCladdingAreaM2 !== undefined) setWallCladdingAreaM2(extracted.wallCladdingAreaM2);

      setAiParseMessage('Successfully extracted project category, roof dimensions, and specifications!');
      setActiveTab('calculator');
    } catch (err: any) {
      setAiParseMessage('Could not extract parameters. Please verify input.');
    } finally {
      setIsAiParsing(false);
    }
  };

  // Real-time calculation using smart roofing engine
  const takeoffInput: SmartTakeoffInput = {
    category,
    existingRoofType: category === 'Residential Re-Roof' ? existingRoofType : 'None (New Build)',
    includeScaffoldingEdgeProtection,
    includePurlinScrewDown,
    roofAreaM2,
    pitchDegrees,
    windZone,
    exposureZone,
    preferredProfile,
    preferredMaterial,
    preferredPanMm,
    wallCladdingAreaM2,
    wallProfile,
    storeys,
    includeRainwater,
    targetMarginPercent
  };

  const preview = generateSmartScopeOfWorks(takeoffInput);
  const previewGrandTotal = preview.rows.reduce((sum, r) => sum + r.totalNZD, 0);
  const previewCostTotal = preview.rows.reduce((sum, r) => sum + (r.unitCostNZD * r.quantity * (1 + (r.wastagePercent || 0) / 100)), 0);

  const handleApplyToQuote = () => {
    onApplyScope(preview.sections, preview.rows, preview.executiveSummary);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-400/30">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Smart Scope &amp; Takeoff Engine</h3>
                <span className="text-[10px] bg-sky-400/20 text-sky-200 px-2 py-0.5 rounded font-mono font-semibold border border-sky-400/30">
                  NZBC E2/AS1 Automated
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Generates a complete, mathematically verified architectural metal roofing and wall cladding bill of materials.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('calculator')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'calculator'
                ? 'bg-white text-slate-900 border border-slate-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Ruler className="w-3.5 h-3.5 text-sky-600" />
            <span>Parametric Takeoff Calculator</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai_brief')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ai_brief'
                ? 'bg-white text-slate-900 border border-slate-200 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 text-purple-600" />
            <span>AI Brief &amp; Email Parser</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {aiParseMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{aiParseMessage}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setAiParseMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {activeTab === 'ai_brief' ? (
            /* AI Brief Extractor Tab */
            <div className="space-y-4">
              <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-100 space-y-1">
                <span className="font-bold text-purple-950 block">Natural Language Project Brief &amp; Re-Roof Extractor</span>
                <p className="text-[11px] text-purple-900/80">
                  Paste email correspondence, re-roof site notes, architect tender briefs, or council plans. The AI engine automatically detects project type (Re-roof vs Bespoke build), dimensions, existing substrate, and profiles.
                </p>
              </div>

              {/* Sample Quick-Presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-500 font-medium">Quick Sample Briefs:</span>
                <button
                  type="button"
                  onClick={() => setBriefText(`Residential re-roof enquiry for 142 Richmond Road, Grey Lynn:
Existing weathered corrugated iron roof (approx 190 m² at 15° pitch).
Looking to strip and replace with new 0.55mm TRS Corrugate in Slate Grey / Ebony with new synthetic underlay.
Require perimeter edge protection to comply with WorkSafe NZ, check all timber purlins and re-screw.
Also replace old rusty spouting with new continuous quarter-round gutters and two downpipes.`)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 font-medium cursor-pointer"
                >
                  🔨 Villa Re-Roof (Iron)
                </button>
                <button
                  type="button"
                  onClick={() => setBriefText(`Re-roof tender for 34 Ocean View Road, Takapuna:
Current roof is 240 m² decramastic pressed metal tiles in poor condition, 18° pitch, coastal Zone D.
Owner wants to strip decramastic tiles and battens, de-nail, and install TRS Plumbdeck Trapezoidal 0.55mm in MagnaFlow®.
Include WorkSafe perimeter scaffolding and continuous 150mm Colorsteel spouting.`)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 font-medium cursor-pointer"
                >
                  🔨 Takapuna Tile Conversion
                </button>
                <button
                  type="button"
                  onClick={() => setBriefText(`Architectural tender from Fearon Hay Architects:
New high-end coastal residence at 88 Matakana Valley Road.
Main roof is approximately 280 m² at 4° pitch requiring continuous Archtech Super Seam 38mm standing seam with 316 stainless sliding clips.
Also requires 80 m² of vertical interlocking wall cladding with 25mm shadow reveal.
Wind zone is Extra High (Zone D Severe Marine). MagnaFlow® substrate required.`)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 font-medium cursor-pointer"
                >
                  🏛️ Matakana Bespoke Build
                </button>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1.5">
                  Paste Brief, Re-Roof Notes, or Architect Specifications
                </label>
                <textarea
                  rows={6}
                  value={briefText}
                  onChange={(e) => setBriefText(e.target.value)}
                  placeholder="Paste enquiry details here..."
                  className="w-full p-3 border border-slate-300 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">
                  Powered by Google Gemini 3.8 Flash + NZ Building Code Engine
                </span>
                <button
                  type="button"
                  onClick={handleAIBriefExtract}
                  disabled={isAiParsing}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isAiParsing ? 'Analyzing Scope...' : 'Extract & Auto-Fill Form'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Parametric Inputs & Live Preview */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Form Controls (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                
                {/* Project Category Bar */}
                <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">Project Classification &amp; Scope</span>
                    <span className="text-[10px] text-slate-500">All Profiled Metal Roofing Specialists</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { id: 'Residential Re-Roof', label: 'Residential Re-Roof', icon: '🔨' },
                      { id: 'New Residential Build', label: 'New Long-Run Build', icon: '🏡' },
                      { id: 'Architectural Bespoke', label: 'Bespoke Architectural', icon: '🏛️' },
                      { id: 'Commercial / Industrial', label: 'Commercial / Rib', icon: '🏢' }
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategoryChange(cat.id as ProjectCategory)}
                        className={`px-2.5 py-1.5 rounded-lg font-semibold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                          category === cat.id
                            ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>{cat.icon}</span>
                        <span className="text-[11px] truncate">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Re-Roof Specific Scope Settings */}
                {category === 'Residential Re-Roof' && (
                  <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200 space-y-3">
                    <div className="flex items-center justify-between border-b border-amber-200/80 pb-1.5">
                      <span className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                        <Hammer className="w-3.5 h-3.5 text-amber-700" />
                        <span>Re-Roof Strip &amp; WorkSafe Height Safety Configuration</span>
                      </span>
                      <span className="text-[10px] bg-amber-200/60 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                        Turnkey Package
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-medium text-amber-950 block mb-1">
                          Existing Roof Covering to Strip
                        </label>
                        <select
                          value={existingRoofType}
                          onChange={(e) => setExistingRoofType(e.target.value as ExistingRoofType)}
                          className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg font-medium text-slate-900 focus:ring-1 focus:ring-amber-600"
                        >
                          <option value="Corrugated Iron">Corrugated Iron (Strip &amp; Scrap)</option>
                          <option value="Decramastic / Metal Tile">Decramastic / Pressed Metal Tiles</option>
                          <option value="Concrete / Clay Tile">Concrete / Clay Tile (Heavy Strip)</option>
                          <option value="Asbestos Super Six / Shingles">Asbestos Super Six (Class B Certified)</option>
                          <option value="Membrane / Butynol">Degraded Membrane / Butynol</option>
                        </select>
                      </div>

                      <div className="space-y-2 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-slate-800">
                          <input
                            type="checkbox"
                            checked={includeScaffoldingEdgeProtection}
                            onChange={(e) => setIncludeScaffoldingEdgeProtection(e.target.checked)}
                            className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span className="text-[11px] font-medium">WorkSafe NZ Perimeter Edge Protection</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-slate-800">
                          <input
                            type="checkbox"
                            checked={includePurlinScrewDown}
                            onChange={(e) => setIncludePurlinScrewDown(e.target.checked)}
                            className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span className="text-[11px] font-medium">Purlin Structural Inspection &amp; Bugle Screws</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Envelope Areas & Slope */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <span className="font-bold text-slate-900 block border-b pb-1 text-xs">
                    Dimensions &amp; Surface Area
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-medium text-slate-700 block mb-1">
                        Roof Area (Plan m²)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={10000}
                        value={roofAreaM2}
                        onChange={(e) => setRoofAreaM2(Number(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-1 focus:ring-sky-600"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-slate-700 block mb-1">
                        Roof Pitch (Degrees °)
                      </label>
                      <input
                        type="number"
                        min={3}
                        max={60}
                        value={pitchDegrees}
                        onChange={(e) => setPitchDegrees(Number(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-1 focus:ring-sky-600"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-slate-700 block mb-1">
                        Building Height
                      </label>
                      <select
                        value={storeys}
                        onChange={(e) => setStoreys(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-1 focus:ring-sky-600"
                      >
                        <option value={1}>Single Storey</option>
                        <option value={2}>2-Storey Standard</option>
                        <option value={3}>3-Storey / Steep Access</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-medium text-slate-700 block mb-1">
                        Wall Cladding (m²)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={5000}
                        value={wallCladdingAreaM2}
                        onChange={(e) => setWallCladdingAreaM2(Number(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-1 focus:ring-sky-600"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-slate-700 block mb-1">
                        Cover / Pan Width (mm)
                      </label>
                      <input
                        type="number"
                        value={preferredPanMm}
                        onChange={(e) => setPreferredPanMm(Number(e.target.value) || 450)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-1 focus:ring-sky-600"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-slate-700 block mb-1">
                        Target Margin %
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={50}
                        value={targetMarginPercent}
                        onChange={(e) => setTargetMarginPercent(Number(e.target.value) || 20)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-1 focus:ring-sky-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Bill of Materials & Calculations (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-xs uppercase tracking-wide text-sky-400">
                      Calculated Bill of Quantities
                    </span>
                    <span className="font-mono text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                      {preview.sections.length} Packages · {preview.rows.length} Items
                    </span>
                  </div>

                  <div className="space-y-2 text-[11px] font-mono divide-y divide-slate-800/80">
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400">Project Category:</span>
                      <span className="font-bold text-sky-400">{category}</span>
                    </div>
                    {category === 'Residential Re-Roof' && (
                      <>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-amber-400">Demolition &amp; Strip:</span>
                          <span className="font-bold text-white">{preview.totalTrayM2} m² ({existingRoofType})</span>
                        </div>
                        {includeScaffoldingEdgeProtection && (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-amber-400">WorkSafe Edge Protection:</span>
                            <span className="font-bold text-white">{Math.round(Math.sqrt(roofAreaM2) * 4.2)} lm perimeter</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400">New Roof Envelope:</span>
                      <span className="font-bold text-white">{preview.totalTrayM2} m² (slope area)</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400">Profile / Sheets:</span>
                      <span className="font-bold text-white">{preview.totalTrayLm} lm ({preferredProfile})</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400">Fasteners / Cleats:</span>
                      <span className="font-bold text-white">
                        {preferredProfile.includes('Corrugate') || preferredProfile.includes('Plumbdeck')
                          ? `${preview.totalFixingClipsCount} Class 4/5 Hex Screws`
                          : `${preview.totalFixingClipsCount} 316 Stainless Cleats`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400">Perimeter Flashings:</span>
                      <span className="font-bold text-white">{preview.totalFlashingLm} lm (Ridge, Barge, Apron)</span>
                    </div>
                    {includeRainwater && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-400">Continuous Rainwater:</span>
                        <span className="font-bold text-white">{Math.round(Math.sqrt(roofAreaM2) * 1.8)} lm + downpipes</span>
                      </div>
                    )}
                  </div>

                  {/* Financial Ribbon */}
                  <div className="pt-2 border-t border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Wholesale TRS Supply + Labour:</span>
                      <span className="font-mono">{formatNZD(previewCostTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Subtotal (excl. GST):</span>
                      <span className="font-mono">{formatNZD(previewGrandTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-400 font-bold text-sm pt-1 border-t border-slate-800">
                      <span>Total Contract Sum (incl. 15% GST):</span>
                      <span className="font-mono">{formatNZD(previewGrandTotal * 1.15)}</span>
                    </div>
                  </div>
                </div>

                {/* Code Compliance Indicator Card */}
                <div className={`p-3.5 rounded-xl border ${
                  preview.complianceAudit.status === 'compliant'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : preview.complianceAudit.status === 'warning'
                    ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      {preview.complianceAudit.status === 'compliant' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <span>NZBC E2/AS1 Compliance Score: {preview.complianceAudit.overallScore}%</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase">
                      {preview.complianceAudit.status}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    {preview.complianceAudit.summary}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500">
            Clicking apply populates all sections, m², items, dynamic matrix rates, and formulas into your active quote.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyToQuote}
              className="px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>Apply Generated Scope ({formatNZD(previewGrandTotal * 1.15)})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
