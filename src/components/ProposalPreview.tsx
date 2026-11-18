import React, { useState, useMemo } from 'react';
import {
  Quote,
  Project,
  SpreadsheetSection,
  SpreadsheetRow,
  RoofingProfile,
  CoilMaterial
} from '../types/crm';
import { ArchtechLogo } from './ArchtechLogo';
import { ArchitecturalSvgDiagram } from './ArchitecturalSvgDiagram';
import { formatDate, formatNZD } from '../utils/formatters';
import {
  Printer,
  Send,
  Check,
  ExternalLink,
  FileText,
  ShieldCheck,
  Layers,
  Sparkles,
  Sliders,
  Palette,
  CheckCircle2,
  AlertCircle,
  Hammer,
  Building,
  CheckSquare,
  Square,
  Pencil,
  Eye,
  SlidersHorizontal
} from 'lucide-react';

export interface ProposalPreviewProps {
  quote: Quote;
  project?: Project;
  sections: SpreadsheetSection[];
  rows: SpreadsheetRow[];
  onAcceptQuote?: (signatureName: string) => void;
  onUpdateQuote?: (updatedQuote: Quote) => void;
  onSwitchToMatrix?: () => void;
  onOpenClientPortalQuote?: (quoteId: string, projectId: string) => void;
  onOpenAIPolisher?: () => void;
  className?: string;
}

export type ProposalTemplate = 'architectural' | 'residential_reroof' | 'modern_minimal' | 'commercial_tender';
export type ProposalDetailLevel = 'holistic' | 'itemized_rates' | 'itemized_no_rates' | 'section_summary';

export interface HolisticScopePackage {
  id: string;
  sourceSectionId?: string;
  systemCategory: string;
  cleanTitle: string;
  systemKicker: string;
  systemSummary: string;
  scopeAreaM2?: number;
  pitchDegrees?: number;
  profile?: string;
  material?: string;
  panWidthMm?: number;
  subtotalNZD: number;
  ratePerM2NZD?: number;
  rows: SpreadsheetRow[];
  inclusions: string[];
}

export const ProposalPreview: React.FC<ProposalPreviewProps> = ({
  quote,
  project,
  sections,
  rows,
  onAcceptQuote,
  onUpdateQuote,
  onSwitchToMatrix,
  onOpenClientPortalQuote,
  onOpenAIPolisher,
  className = ''
}) => {
  // Presentation Controls State
  const [template, setTemplate] = useState<ProposalTemplate>(() => {
    if (quote.proposalTemplate) return quote.proposalTemplate as ProposalTemplate;
    if (quote.category === 'Residential Re-Roof' || quote.profile?.includes('Corrugate')) {
      return 'residential_reroof';
    }
    return 'architectural';
  });

  const [detailLevel, setDetailLevel] = useState<ProposalDetailLevel>('holistic');
  const [isEditingCoverLetter, setIsEditingCoverLetter] = useState(false);
  const [coverLetterText, setCoverLetterText] = useState(
    quote.proposalCoverLetter ||
    (quote.category === 'Residential Re-Roof' || quote.profile?.includes('Corrugate')
      ? `Thank you for inviting Archtech to provide a comprehensive re-roofing proposal for your property at ${quote.siteAddress || 'your address'}.\n\nArchtech specializes in all profiled metal roofing — delivering turn-key strip-and-replace solutions with complete peace of mind. We carefully stage our work each day to ensure your home remains completely weather-tight throughout the project. Our team provides WorkSafe-certified perimeter edge protection, thorough structural purlin inspections, and daily magnetic sweeps of your grounds to keep your family and property safe.\n\nYour new ${quote.profile || 'profiled metal'} roof in ${quote.material || 'prepainted steel'} is sourced directly from The Roofing Store, backed by up to 35-year manufacturer warranties and a 10-Year Archtech Workmanship Guarantee supervised by Licensed Building Practitioner Marcus Kuhtze (BP134821).`
      : `Thank you for the opportunity to present our comprehensive architectural quotation for the profiled metal envelope package at ${quote.siteAddress || 'the specified site'}.\n\nArchtech is an accredited specialist installer of all profiled metal roofing and custom-folded architectural flashings. All roll-forming and coil substrates are sourced directly from The Roofing Store (NZ), fabricated with Vitor+® and MagnaFlow® prepainted steel to withstand New Zealand's severe marine and high-wind environments.\n\nAll installations are managed by registered Licensed Building Practitioners (LBP) under the supervision of Marcus Kuhtze (BP134821), ensuring complete compliance with NZBC E2/AS1, MRM Code of Practice, and local council Producer Statement PS3 requirements.`)
  );

  // Optional Enhancements Selection State
  const [selectedOptionalUpgrades, setSelectedOptionalUpgrades] = useState<Record<string, boolean>>({
    'opt-magnaflow': quote.exposureZone === 'Zone D (Severe Marine)',
    'opt-vent-ridge': quote.profile?.includes('Super Seam') ?? false
  });

  // Client Digital Acceptance State
  const [clientSignerName, setClientSignerName] = useState('');
  const [isSignAgreementChecked, setIsSignAgreementChecked] = useState(false);
  const [isSignedSuccess, setIsSignedSuccess] = useState(quote.status === 'accepted');

  // -------------------------------------------------------------------
  // INTELLIGENT SCOPE AGGREGATION
  // Replaces raw "Section 1", "Section 2", "Section 3" with holistic packages
  // -------------------------------------------------------------------
  const holisticScopes = useMemo<HolisticScopePackage[]>(() => {
    // Check if sections already have semantic non-numbered titles
    const packages: HolisticScopePackage[] = [];

    // Analyze each section and aggregate items
    sections.forEach((sec, idx) => {
      const secRows = rows.filter(r => r.sectionId === sec.id);
      if (secRows.length === 0) return;

      const subtotal = secRows.reduce((sum, r) => sum + r.totalNZD, 0);

      // Strip robotic internal numbering: "Section 1", "1. ", "sec-1 - "
      const rawTitle = sec.title.trim();
      const cleaned = rawTitle
        .replace(/^(\d+[\.\-\)]\s*|Section\s*\d+\s*[\:\-]?\s*)/i, '')
        .trim();

      const lower = (cleaned || rawTitle).toLowerCase();
      const hasRoof = sec.sectionType === 'roof' || lower.includes('roof') || lower.includes('tray') || lower.includes('pan');
      const hasCladding = sec.sectionType === 'wall_cladding' || lower.includes('wall') || lower.includes('cladding') || lower.includes('facade');
      const hasRainwater = sec.sectionType === 'rainwater' || lower.includes('rainwater') || lower.includes('spouting') || lower.includes('gutter') || lower.includes('downpipe');
      const hasFlashings = sec.sectionType === 'flashings' || lower.includes('flashing') || lower.includes('ridge') || lower.includes('barge') || lower.includes('capping');
      const hasReRoofDemolition = lower.includes('strip') || lower.includes('demolition') || lower.includes('re-roof') || lower.includes('cleanfill');
      const hasPrelims = sec.sectionType === 'custom' || lower.includes('safety') || lower.includes('scaffold') || lower.includes('edge protection') || lower.includes('prelim');

      let systemCategory = 'Architectural Scope Package';
      let systemKicker = 'Engineered Specification';
      let cleanTitle = cleaned || `Architectural Package ${idx + 1}`;
      let systemSummary = '';
      const inclusions: string[] = [];

      if (hasReRoofDemolition || (quote.category === 'Residential Re-Roof' && idx === 0 && lower.includes('strip'))) {
        systemCategory = 'Deconstruction & Site Preparation';
        systemKicker = 'Clean Strip, Waste Disposal & Structural Pre-Check';
        cleanTitle = 'Re-Roof Strip & Purlin Structural Inspection';
        systemSummary = 'Careful daily deconstruction of existing roofing material into dedicated cleanfill bins. Includes structural inspection of timber purlins, replacement of compromised fixings with heavy-duty structural bugle screws, and daily magnetic perimeter sweeps.';
        inclusions.push(
          'Complete removal and cleanfill cartage of existing roof coverings',
          'Detailed structural inspection of exposed purlins/battens',
          'Re-securing purlins with Class 4 structural screws prior to underlay',
          'Daily ground protection and magnetic sweeps for fasteners'
        );
      } else if (hasRoof) {
        systemCategory = 'Primary Roof Envelope System';
        systemKicker = 'Precision Rollforming & Concealed Thermal Fixing';
        const profileName = sec.defaultProfile || quote.profile || 'Profiled Metal Roof';
        const materialName = (sec.defaultMaterial || quote.material || 'Vitor+®').replace(/\s*\(.*?\)/g, '');
        cleanTitle = `${profileName} Envelope (${materialName})`;
        systemSummary = `Supply, precision fabrication, and installation of continuous ${profileName} panels in ${materialName}. Laid over heavy-duty micro-porous synthetic underlay with engineered thermal sliding cleats to allow unrestricted expansion and prevent oil-canning, fully compliant with NZBC E2/AS1.`;
        inclusions.push(
          `Continuous full-length ${profileName} profiles rollformed to site dimensions`,
          `Engineered ${materialName} prepainted steel with up to 35-yr coating durability`,
          'Micro-porous synthetic breather underlay with 150mm taped laps',
          'Sliding expansion cleats allowing unrestricted thermal expansion',
          'Double-lock mechanical seaming and stop-ended drainage pans'
        );
      } else if (hasCladding) {
        systemCategory = 'Vertical Facade & Wall Cladding System';
        systemKicker = 'Interlocking Cassette Facade & Cavity Integration';
        cleanTitle = sec.defaultProfile ? `${sec.defaultProfile} Architectural Wall Cladding` : 'Vertical Interlocking Wall Cladding System';
        systemSummary = 'Precision-formed interlocking wall facade panels with concealed fastener returns and engineered shadow reveals. Fully integrated into a drained and vented cavity system with color-matched jamb, head, and base kick-out flashings.';
        inclusions.push(
          'Interlocking architectural cladding panels with 25mm shadow reveal',
          'Concealed screw fastening eliminating visible penetrations',
          'Integration with drained and vented cavity battens',
          'Color-matched architectural head, jamb, and base kick-out flashings'
        );
      } else if (hasRainwater) {
        systemCategory = 'Continuous Rainwater Management';
        systemKicker = 'Seamless High-Capacity Spouting & Downpipes';
        cleanTitle = 'Continuous Spouting & Rainwater Drainage Package';
        systemSummary = 'Continuous high-capacity spouting engineered to prevent back-flow into soffits, secured with heavy-duty internal/external structural brackets. Includes color-matched round or rectangular downpipes, drop outlets, and debris screening.';
        inclusions.push(
          'Continuous seamless spouting rollformed to exact fascia lengths',
          'Heavy-duty color-matched structural brackets at 600mm centres',
          'Expansion-tolerant droppers and high-flow downpipes to stormwater',
          'Full weathertight seal at end caps and external corners'
        );
      } else if (hasFlashings) {
        systemCategory = 'Perimeter Junction & Penetration Weatherproofing';
        systemKicker = 'Workshop-Folded Custom Flashings (NZBC E2/AS1)';
        cleanTitle = 'Architectural Flashings, Ridges & Parapet Cappings';
        systemSummary = 'All perimeter barges, ventilated ridge caps, aprons, abutments, and parapet cappings precision-folded in our workshop. Designed with safety hem edges, 85mm upstands, and 5° slopes in strict conformance with NZBC Acceptable Solution E2/AS1.';
        inclusions.push(
          'Custom CNC Variobend folding to site-measured girths and angles',
          'Ventilated ridge apex assemblies ensuring roof cavity air exchange',
          '85mm minimum upstands and 5° minimum parapet drainage fall',
          'Hidden safety hem edges and soft-edge under-flashing seals'
        );
      } else if (hasPrelims) {
        systemCategory = 'Site Logistics, Safety & Council Compliance';
        systemKicker = 'WorkSafe NZ Fall Protection & LBP Producer Statement';
        cleanTitle = 'WorkSafe NZ Height Safety & Council PS3 Sign-Off';
        systemSummary = 'Complete compliance management including WorkSafe NZ certified perimeter edge protection, SiteWise Green audited health & safety protocols, LBP supervision (Marcus Kuhtze BP134821), and formal Producer Statement PS3 for Council Code Compliance.';
        inclusions.push(
          'WorkSafe NZ compliant certified perimeter tubular edge protection',
          'Site-specific safety plan (SSSP) and SiteWise Green certified crew',
          'Licensed Building Practitioner (LBP) supervision throughout installation',
          'Formal Producer Statement PS3 (Construction) issued for Council CCC'
        );
      } else {
        systemCategory = 'Architectural Scope Package';
        systemKicker = 'Specification & Components Schedule';
        systemSummary = `Comprehensive supply and installation package covering all items scheduled below, fully coordinated with adjacent trade works and approved drawings.`;
        inclusions.push(
          'Quality materials sourced through The Roofing Store partnership',
          'Trade installation conforming to MRM Code of Practice and NZBC',
          'Manufacturer warranty certification upon contract completion'
        );
      }

      const scopeAreaM2 = sec.totalM2 || (hasRoof ? quote.roofAreaM2 : undefined);
      const ratePerM2NZD = scopeAreaM2 && scopeAreaM2 > 0 ? Math.round(subtotal / scopeAreaM2) : undefined;

      packages.push({
        id: sec.id,
        sourceSectionId: sec.id,
        systemCategory,
        cleanTitle,
        systemKicker,
        systemSummary,
        scopeAreaM2,
        pitchDegrees: hasRoof ? ((quote as any).roofPitch || (quote as any).pitchDegrees || 15) : undefined,
        profile: sec.defaultProfile || (hasRoof ? quote.profile : undefined),
        material: sec.defaultMaterial || (hasRoof ? quote.material : undefined),
        panWidthMm: sec.defaultPanSizeMm,
        subtotalNZD: subtotal,
        ratePerM2NZD,
        rows: secRows,
        inclusions
      });
    });

    return packages;
  }, [sections, rows, quote]);

  // Financial Calculations
  const baseSubtotalNZD = useMemo(() => {
    return rows.reduce((sum, r) => sum + r.totalNZD, 0);
  }, [rows]);

  const optionalUpgradesList = [
    {
      id: 'opt-magnaflow',
      title: 'The Roofing Store MagnaFlow® Marine Alloy Coating Upgrade',
      description: 'Upgrades coating from Vitor+ to MagnaFlow (Magnesium-Zinc-Aluminium alloy) with 35-year warranty for coastal Zone D marine environments.',
      additionalCostNZD: Math.round(baseSubtotalNZD * 0.08)
    },
    {
      id: 'opt-vent-ridge',
      title: 'Architectural Ventilated Ridge Apex Assembly (E2/AS1)',
      description: 'Continuous concealed air-permeable ventilation mesh beneath apex flashing to ensure roof cavity moisture exhaust and eliminate condensation risk.',
      additionalCostNZD: 850
    },
    {
      id: 'opt-downpipes',
      title: 'Continuous Colorsteel® 80mm Downpipes & Rainwater Droppers',
      description: 'Four complete downpipe drops with expansion droppers, stand-off brackets, and connection to ground stormwater lines.',
      additionalCostNZD: 1150
    }
  ];

  const upgradesTotal = useMemo(() => {
    return optionalUpgradesList.reduce((acc, curr) => {
      return selectedOptionalUpgrades[curr.id] ? acc + curr.additionalCostNZD : acc;
    }, 0);
  }, [selectedOptionalUpgrades, optionalUpgradesList]);

  const contractSubtotal = baseSubtotalNZD + upgradesTotal;
  const contractGst = Math.round(contractSubtotal * 0.15 * 100) / 100;
  const contractGrandTotal = contractSubtotal + contractGst;

  // Inclusions & Exclusions
  const scopeInclusions = [
    'Complete supply and precision roll-forming of specified profiled metal roofing and cladding',
    'Heavy-duty micro-porous synthetic breather underlay installed with 150mm taped laps',
    'Concealed marine-grade fixing cleats / fasteners with allowance for thermal movement',
    'Custom workshop-folded flashings with safety hem edges and 85mm upstands (NZBC E2/AS1)',
    'WorkSafe NZ certified perimeter edge protection / tubular scaffolding where scheduled',
    'Producer Statement PS3 (Construction) issued by Licensed Building Practitioner Marcus Kuhtze (BP134821)',
    'The Roofing Store 25-Year to 35-Year manufacturer substrate and coating performance warranty',
    'Archtech 10-Year Workmanship and Weathertightness Guarantee'
  ];

  const scopeExclusions = [
    'Supply and installation of structural timber framing, trusses, or plywood substrate (by Builder)',
    'Internal electrical, plumbing, insulation, or painting works',
    'Building consent council application fees and processing charges',
    'Structural steel framing modifications or substrate remedial work not explicitly scheduled',
    'Connection to underground stormwater mains beyond downpipe shoe level'
  ];

  // Statutory Payment Milestones (NZ CCA 2002)
  const paymentMilestones = [
    { stage: 'Deposit / Coil Commitment', percentage: 30, description: 'Upon signing to secure raw coil allocation at The Roofing Store' },
    { stage: 'Substrate & Underlay Complete', percentage: 30, description: 'Following site measure, moisture check & underlay install' },
    { stage: 'Profile Trays & Cladding Fixed', percentage: 30, description: 'Upon completion of tray fixing and mechanical double-seaming' },
    { stage: 'Practical Completion & PS3', percentage: 10, description: 'Upon flashing completion, final inspection and PS3 issuance' }
  ];

  const handleClientAccept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientSignerName.trim() || !isSignAgreementChecked) return;

    setIsSignedSuccess(true);
    if (onAcceptQuote) {
      onAcceptQuote(clientSignerName.trim());
    } else if (onUpdateQuote) {
      onUpdateQuote({
        ...quote,
        status: 'accepted',
        clientSignature: clientSignerName.trim(),
        signedAt: new Date().toISOString()
      });
    }
  };

  return (
    <div className={`space-y-4 print:space-y-0 ${className}`}>
      {/* ========================================================================= */}
      {/* 1. TOP CONTROL BAR (Print Hidden)                                         */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs print:hidden space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Template Switcher & Detail Controls */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Template Selector */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                <Palette className="w-3.5 h-3.5 text-sky-600" />
                Template:
              </span>
              <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTemplate('architectural')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    template === 'architectural'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🏛️ Architectural
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate('residential_reroof')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    template === 'residential_reroof'
                      ? 'bg-amber-600 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🔨 Re-Roof
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate('modern_minimal')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    template === 'modern_minimal'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📐 Minimalist
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate('commercial_tender')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    template === 'commercial_tender'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🏢 Commercial
                </button>
              </div>
            </div>

            {/* Detail Level Selector */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                <Sliders className="w-3.5 h-3.5 text-sky-600" />
                Detail Level:
              </span>
              <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDetailLevel('holistic')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    detailLevel === 'holistic'
                      ? 'bg-slate-900 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Replaces Section 1/2/3 with cohesive architectural scope packages"
                >
                  Holistic Systems
                </button>
                <button
                  type="button"
                  onClick={() => setDetailLevel('itemized_no_rates')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    detailLevel === 'itemized_no_rates'
                      ? 'bg-slate-900 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Shows all items & quantities with bundled package totals"
                >
                  Itemized (No Rates)
                </button>
                <button
                  type="button"
                  onClick={() => setDetailLevel('itemized_rates')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    detailLevel === 'itemized_rates'
                      ? 'bg-slate-900 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Full transparent breakdown showing sell rates per line"
                >
                  Itemized + Rates
                </button>
                <button
                  type="button"
                  onClick={() => setDetailLevel('section_summary')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    detailLevel === 'section_summary'
                      ? 'bg-slate-900 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="High-level executive financial summary"
                >
                  Package Summary
                </button>
              </div>
            </div>
          </div>

          {/* Right: Actions (AI Polish, Print, Switch) */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenAIPolisher && (
              <button
                type="button"
                onClick={onOpenAIPolisher}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors cursor-pointer"
                title="Polish scope letter using Gemini AI"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>AI Cover Letter</span>
              </button>
            )}

            {onSwitchToMatrix && (
              <button
                type="button"
                onClick={onSwitchToMatrix}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                title="Return to the pricing spreadsheet"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
                <span>Back to Matrix</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shadow-xs"
              title="Print document or save to PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FORMAL CLIENT PROPOSAL DOCUMENT                                        */}
      {/* ========================================================================= */}
      <div className="bg-white shadow-xl rounded-2xl border border-slate-200 max-w-5xl mx-auto overflow-hidden text-xs print:border-none print:shadow-none print:rounded-none">
        
        {/* HEADER VARIANT A: Architectural Studio (Dark Slate, Technical Spec) */}
        {template === 'architectural' && (
          <div className="bg-slate-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b-2 border-slate-700">
            <div>
              <ArchtechLogo variant="light" className="h-11 sm:h-13 w-auto max-w-[220px] mb-3 object-left" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-mono font-bold text-sky-400 bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700">
                  {quote.quoteNumber} (v{quote.version})
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Architectural Metal Roofing Specification
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono text-slate-400">
                  LBP BP134821 Active
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Architectural Metal Roofing &amp; Cladding Proposal
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Client: <strong className="text-white">{quote.clientName}</strong> · Site: {quote.siteAddress}
              </p>
            </div>

            <div className="text-left sm:text-right font-mono text-xs space-y-1 bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 shrink-0">
              <div>
                <span className="text-slate-400 text-[10px] uppercase tracking-wider block">Date Issued</span>
                <span className="font-bold text-white text-xs">{formatDate(quote.createdAt)}</span>
              </div>
              <div className="pt-1">
                <span className="text-slate-400 text-[10px] uppercase tracking-wider block">Validity (30 Days)</span>
                <span className="font-semibold text-amber-400 text-xs">{formatDate(quote.expiresAt)}</span>
              </div>
              <div className="text-[10px] text-emerald-400 font-bold pt-1">
                ✓ Dynamic Rates Locked
              </div>
            </div>
          </div>
        )}

        {/* HEADER VARIANT B: Residential Re-Roof (Amber / High Trust Homeowner) */}
        {template === 'residential_reroof' && (
          <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b-2 border-amber-600">
            <div>
              <ArchtechLogo variant="light" className="h-11 sm:h-13 w-auto max-w-[220px] mb-3 object-left" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-200">
                <span className="font-mono font-bold text-amber-400 bg-amber-950/80 px-2.5 py-0.5 rounded border border-amber-600/40">
                  {quote.quoteNumber} (v{quote.version})
                </span>
                <span aria-hidden="true" className="text-amber-800">·</span>
                <span className="font-semibold flex items-center gap-1 text-amber-300">
                  <Hammer className="w-3.5 h-3.5 text-amber-400" />
                  Turnkey Residential Re-Roofing Package
                </span>
                <span aria-hidden="true" className="text-amber-800">·</span>
                <span className="font-mono text-slate-300">
                  WorkSafe NZ Edge Protection &amp; 10-Yr Guarantee
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                Residential Re-Roofing Proposal &amp; Contract
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Homeowner: <strong className="text-white">{quote.clientName}</strong> · Property Address: {quote.siteAddress}
              </p>
            </div>

            <div className="text-left sm:text-right font-mono text-xs space-y-1 bg-slate-800/80 p-3.5 rounded-xl border border-amber-600/30 shrink-0">
              <div>
                <span className="text-slate-400 text-[10px] uppercase tracking-wider block">Date Issued</span>
                <span className="font-bold text-white text-xs">{formatDate(quote.createdAt)}</span>
              </div>
              <div className="pt-1">
                <span className="text-slate-400 text-[10px] uppercase tracking-wider block">Price Guarantee Window</span>
                <span className="font-semibold text-amber-400 text-xs">{formatDate(quote.expiresAt)}</span>
              </div>
              <div className="text-[10px] text-emerald-400 font-bold pt-1">
                ✓ LBP Supervised (BP134821)
              </div>
            </div>
          </div>
        )}

        {/* HEADER VARIANT C: Modern Minimalist */}
        {template === 'modern_minimal' && (
          <div className="p-6 sm:p-8 border-b border-slate-200 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <ArchtechLogo variant="light" className="h-10 sm:h-12 w-auto max-w-[200px] mb-3 object-left" />
              <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-slate-900">
                Architectural Metal Roofing Specification
              </h1>
              <div className="flex items-center gap-2 text-slate-500 text-xs mt-1.5 font-medium">
                <span>{quote.quoteNumber} (v{quote.version})</span>
                <span aria-hidden="true">·</span>
                <span>{quote.clientName}</span>
                <span aria-hidden="true">·</span>
                <span>{quote.siteAddress}</span>
              </div>
            </div>
            <div className="font-mono text-xs text-slate-600 sm:text-right space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Issue Date</span>
              <span className="font-semibold text-slate-900 block">{formatDate(quote.createdAt)}</span>
              <span className="text-[10px] text-amber-700 block">Valid to {formatDate(quote.expiresAt)}</span>
            </div>
          </div>
        )}

        {/* HEADER VARIANT D: Commercial Tender */}
        {template === 'commercial_tender' && (
          <div className="p-6 sm:p-8 border-b-2 border-slate-900 space-y-3 bg-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <ArchtechLogo variant="light" className="h-10 w-auto" />
              <div className="font-mono text-xs text-right">
                <span className="font-bold text-slate-900 block">FORMAL TENDER SCHEDULE</span>
                <span className="text-slate-500 text-[11px]">Contract Reference: {quote.quoteNumber} (Rev {quote.version})</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">Employer / Client</span>
                <span className="font-bold text-slate-900">{quote.clientName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">Project Address</span>
                <span className="font-bold text-slate-900 truncate block">{quote.siteAddress}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">Architect</span>
                <span className="font-bold text-slate-900">{quote.architect || 'Architectural Designer'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">Compliance Basis</span>
                <span className="font-bold text-emerald-800">NZBC E2/AS1 &amp; CCA 2002</span>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENT BODY */}
        <div className="p-6 sm:p-8 space-y-6">

          {/* Key Envelope Metrics Stat Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Roof Scope Area</span>
              <span className="font-bold text-slate-900 font-mono text-base">
                {sections.find(s => s.sectionType === 'roof')?.totalM2 || quote.roofAreaM2 || 285} m²
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">
                {quote.profile || 'Standing Seam / Profiled Metal'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Specification Coil</span>
              <span className="font-bold text-slate-900 font-mono text-base truncate block">
                {(quote.material || 'The Roofing Store Vitor+').replace(/\s*\(.*?\)/g, '')}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">
                {quote.exposureZone || 'Zone C / D Marine'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Engineered Wind Zone</span>
              <span className="font-bold text-slate-900 font-mono text-base block">
                {quote.windZone || 'Very High (NZS 3604)'}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">
                {((quote as any).roofPitch || (quote as any).pitchDegrees || 15)}° Pitch Verified
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Warranties &amp; PS3</span>
              <span className="font-bold text-emerald-700 font-mono text-base block">
                25-Yr Coating
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">
                10-Yr Workmanship (LBP)
              </span>
            </div>
          </div>

          {/* Architectural Cross-Section Seam Diagram */}
          <div className="bg-slate-50/80 rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                Architectural Seam &amp; Fastening Cross-Section
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Profile: {quote.profile || 'Archtech Super Seam 38mm'}
              </span>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-100 flex items-center justify-center">
              <ArchitecturalSvgDiagram profile={quote.profile || 'Archtech Super Seam 38mm'} className="w-full h-24" />
            </div>
            <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
              <span>Concealed 316 Stainless Sliding Expansion Clips</span>
              <span>Synthetic Breather Underlay with Taped Laps</span>
              <span>NZBC E2/AS1 Compliant Assembly</span>
            </div>
          </div>

          {/* Scope Introduction & Narrative Letter */}
          <div className="p-5 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 uppercase tracking-wide">
                <FileText className="w-3.5 h-3.5 text-sky-600" />
                Scope Methodology &amp; Trade Brief
              </span>
              <button
                type="button"
                onClick={() => setIsEditingCoverLetter(!isEditingCoverLetter)}
                className="text-[11px] text-sky-700 hover:text-sky-900 font-semibold cursor-pointer print:hidden flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" />
                <span>{isEditingCoverLetter ? 'Done Editing' : 'Edit Scope Letter'}</span>
              </button>
            </div>

            {isEditingCoverLetter ? (
              <textarea
                rows={6}
                value={coverLetterText}
                onChange={(e) => setCoverLetterText(e.target.value)}
                className="w-full p-3 border border-sky-300 rounded-xl bg-white text-slate-800 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-hidden"
              />
            ) : (
              <p className="text-slate-700 text-xs whitespace-pre-line leading-relaxed font-normal">
                {coverLetterText}
              </p>
            )}
          </div>

          {/* ============================================================= */}
          {/* HOLISTIC SCOPE OF WORKS PACKAGES (No Section 1/2/3!)           */}
          {/* ============================================================= */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Scope of Works &amp; Architectural Packages
                </h3>
                <p className="text-[11px] text-slate-500">
                  Consolidated envelope specifications with verified scope quantities and components schedule.
                </p>
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-500">
                {detailLevel === 'holistic' && 'Holistic Architectural Systems'}
                {detailLevel === 'itemized_no_rates' && 'Itemized Schedule (Rates Bundled)'}
                {detailLevel === 'itemized_rates' && 'Itemized Schedule with Transparent Rates'}
                {detailLevel === 'section_summary' && 'Executive Financial Summary'}
              </span>
            </div>

            {/* Scope Packages Render List */}
            <div className="space-y-4">
              {holisticScopes.map((scopePkg) => {
                // Case A: Section Summary Mode (Clean 1-Line Overview)
                if (detailLevel === 'section_summary') {
                  return (
                    <div
                      key={scopePkg.id}
                      className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-sky-800 uppercase tracking-wider font-bold">
                          {scopePkg.systemCategory} · {scopePkg.systemKicker}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{scopePkg.cleanTitle}</span>
                          {scopePkg.scopeAreaM2 && scopePkg.scopeAreaM2 > 0 && (
                            <span className="text-[11px] font-mono font-semibold text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                              Scope Area: {scopePkg.scopeAreaM2} m² ({formatNZD(scopePkg.subtotalNZD / scopePkg.scopeAreaM2)}/m²)
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed max-w-2xl font-sans">
                          {scopePkg.systemSummary}
                        </p>
                      </div>

                      <div className="text-left sm:text-right font-mono shrink-0">
                        <span className="font-bold text-slate-900 text-base">{formatNZD(scopePkg.subtotalNZD)}</span>
                        <span className="text-[10px] text-slate-400 block font-sans">Excl. GST</span>
                      </div>
                    </div>
                  );
                }

                // Case B: Holistic Mode & Itemized Modes
                return (
                  <div
                    key={scopePkg.id}
                    className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs"
                  >
                    {/* Package Header Card */}
                    <div className="p-4 sm:p-5 bg-slate-50/90 border-b border-slate-200 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-800">
                            {scopePkg.systemCategory} · {scopePkg.systemKicker}
                          </span>
                          <h4 className="font-bold text-base text-slate-900 mt-0.5">
                            {scopePkg.cleanTitle}
                          </h4>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-left sm:text-right shrink-0">
                          <div>
                            <span className="font-bold text-slate-900 text-base">
                              Package Subtotal: {formatNZD(scopePkg.subtotalNZD)}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-sans">Excl. GST</span>
                          </div>
                        </div>
                      </div>

                      {/* Specification & Scope Area Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-200/60 font-mono text-slate-600">
                        <div className="flex flex-wrap items-center gap-3">
                          {scopePkg.scopeAreaM2 && scopePkg.scopeAreaM2 > 0 && (
                            <span className="font-bold text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md text-[11px]">
                              Scope: {scopePkg.scopeAreaM2} m² ({formatNZD(scopePkg.subtotalNZD / scopePkg.scopeAreaM2)}/m²)
                            </span>
                          )}
                          {scopePkg.profile && (
                            <span className="text-[11px] text-slate-700">
                              Profile: <strong>{scopePkg.profile}</strong>
                            </span>
                          )}
                          {scopePkg.material && (
                            <span className="text-[11px] text-slate-700">
                              Material: <strong>{scopePkg.material.replace(/\s*\(.*?\)/g, '')}</strong>
                            </span>
                          )}
                          {scopePkg.panWidthMm && (
                            <span className="text-[11px] text-slate-700">
                              Pan: <strong>{scopePkg.panWidthMm}mm</strong>
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 font-sans italic">
                          {scopePkg.rows.length} scheduled item{scopePkg.rows.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      {/* Narrative Scope Summary (Holistic View) */}
                      {detailLevel === 'holistic' && (
                        <p className="text-slate-600 text-[11px] font-sans leading-relaxed pt-1">
                          {scopePkg.systemSummary}
                        </p>
                      )}

                      {/* Key Scope Inclusions for this Package */}
                      {detailLevel === 'holistic' && scopePkg.inclusions.length > 0 && (
                        <div className="pt-2">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Included in this system:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-700">
                            {scopePkg.inclusions.map((inc, iIdx) => (
                              <div key={iIdx} className="flex items-start gap-1.5">
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{inc}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Components Breakdown Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                        <thead className="bg-slate-50/50 text-slate-500 font-mono uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-4 w-28">Ref</th>
                            <th className="py-2.5 px-3 font-sans">Component Scope &amp; Specification</th>
                            <th className="py-2.5 px-3 w-20 text-right font-mono">Qty</th>
                            <th className="py-2.5 px-2 w-16 font-mono">Unit</th>
                            {detailLevel === 'itemized_rates' && (
                              <th className="py-2.5 px-3 w-28 text-right font-mono">Sell Rate</th>
                            )}
                            <th className="py-2.5 px-4 w-32 text-right font-mono font-bold">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {scopePkg.rows.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                                {r.itemCode || 'ARCH-SPEC'}
                              </td>
                              <td className="py-2.5 px-3 font-sans">
                                <span className="font-semibold text-slate-900 block">{r.description}</span>
                                {r.notes && (
                                  <span className="text-slate-500 text-[11px] block mt-0.5">{r.notes}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                {r.quantity}
                              </td>
                              <td className="py-2.5 px-2 font-mono text-slate-500 text-[11px]">
                                {r.unit}
                              </td>
                              {detailLevel === 'itemized_rates' && (
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600 text-[11px]">
                                  {formatNZD(r.unitSellNZD)}
                                </td>
                              )}
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                                {detailLevel === 'itemized_no_rates' ? (
                                  <span className="text-slate-400 font-normal italic text-[11px]">Included</span>
                                ) : (
                                  formatNZD(r.totalNZD)
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ============================================================= */}
          {/* SCOPE INCLUSIONS & EXCLUSIONS SCHEDULE                        */}
          {/* ============================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Inclusions */}
            <div className="bg-emerald-50/40 rounded-2xl border border-emerald-200/80 p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                <h4 className="font-bold text-emerald-950 text-xs flex items-center gap-1.5 uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Scope of Works Inclusions
                </h4>
                <span className="text-[10px] font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  Archtech Contract Scope
                </span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700">
                {scopeInclusions.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Exclusions */}
            <div className="bg-amber-50/30 rounded-2xl border border-amber-200/70 p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                <h4 className="font-bold text-amber-950 text-xs flex items-center gap-1.5 uppercase tracking-wide">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Trade Clarifications &amp; Exclusions
                </h4>
                <span className="text-[10px] font-mono text-amber-700 bg-white px-2 py-0.5 rounded border border-amber-200">
                  Owner / Builder Scope
                </span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700">
                {scopeExclusions.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-500 font-bold shrink-0 text-sm leading-none mt-0.5">✕</span>
                    <span className="leading-relaxed text-slate-600">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 25-Year Manufacturer Warranty & Workmanship Guarantee */}
          <div className="p-5 bg-emerald-50/70 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-emerald-950 text-xs">
                  25-Year Vitor+® / MagnaFlow® Performance Warranty &amp; PS3 Producer Statement
                </h4>
                <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                  All roll-formed profiled metal panels and custom flashings carry The Roofing Store's 25-year to 35-year substrate and coating durability guarantee against marine corrosion, delamination, and UV fade. Archtech warrants all installation weathertightness for 10 years in full accordance with NZBC E2/AS1, with formal Producer Statement PS3 provided for Council Code Compliance Certificate (CCC).
                </p>
              </div>
            </div>
            <div className="shrink-0 text-left sm:text-right font-mono text-[11px] text-emerald-900 bg-white/90 p-2.5 rounded-xl border border-emerald-300">
              <span className="font-bold block">AS/NZS 2728 Tested</span>
              <span className="text-slate-500">ISO 9223 C1–C4 Marine</span>
            </div>
          </div>

          {/* Interactive Optional Enhancements */}
          <div className="p-5 bg-gradient-to-br from-sky-50/70 to-indigo-50/70 rounded-2xl border border-sky-200 space-y-3 print:hidden">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-sky-950 flex items-center gap-2 uppercase tracking-wide">
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  Optional Architectural Scope Enhancements
                </h4>
                <p className="text-[11px] text-sky-800">
                  Select optional upgrades to include in this contract. Total recalculates dynamically.
                </p>
              </div>
              <span className="font-mono font-bold text-sky-900 text-xs">
                +{formatNZD(upgradesTotal)} Selected
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {optionalUpgradesList.map((opt) => {
                const isSelected = !!selectedOptionalUpgrades[opt.id];
                return (
                  <div
                    key={opt.id}
                    onClick={() =>
                      setSelectedOptionalUpgrades((prev) => ({
                        ...prev,
                        [opt.id]: !prev[opt.id]
                      }))
                    }
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-white border-sky-500 shadow-xs'
                        : 'bg-white/60 border-slate-200 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-colors ${
                          isSelected ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">{opt.title}</span>
                        <span className="text-slate-600 text-[11px] block mt-0.5">{opt.description}</span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-sky-900 shrink-0 text-xs">
                      +{formatNZD(opt.additionalCostNZD)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Schedule & Milestones (NZ CCA 2002) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Contract Payment Milestones (NZ Construction Contracts Act CCA 2002)
              </h4>
              <span className="text-[10px] font-mono text-slate-400">Statutory Draw Schedule</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              {paymentMilestones.map((m, mIdx) => (
                <div key={mIdx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500 block text-[10px] font-semibold">{m.stage} ({m.percentage}%)</span>
                  <span className="font-bold text-slate-900 text-sm block">
                    {formatNZD(contractGrandTotal * (m.percentage / 100))}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans block">{m.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Final Financial Totals Block */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-3 font-mono shadow-md">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Base Contract Scope Subtotal:</span>
              <span>{formatNZD(baseSubtotalNZD)}</span>
            </div>
            {upgradesTotal > 0 && (
              <div className="flex items-center justify-between text-xs text-sky-400">
                <span>Selected Architectural Scope Enhancements:</span>
                <span>+{formatNZD(upgradesTotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-slate-800">
              <span>Total Scope Value (Excl. GST):</span>
              <span className="font-bold">{formatNZD(contractSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>New Zealand Goods &amp; Services Tax (15% GST):</span>
              <span>{formatNZD(contractGst)}</span>
            </div>
            <div className="flex items-center justify-between text-lg sm:text-xl font-bold text-emerald-400 pt-3 border-t border-slate-700">
              <span>Total Contract Investment (Incl. 15% GST):</span>
              <span>{formatNZD(contractGrandTotal)}</span>
            </div>
          </div>

          {/* Interactive Digital Acceptance Form */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 print:bg-white print:border-none">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="font-bold text-sm text-slate-900">Digital Acceptance &amp; Electronic Execution</h4>
              <span className="text-[10px] font-mono text-slate-500">Legal Agreement (NZ Law)</span>
            </div>

            {isSignedSuccess || quote.status === 'accepted' ? (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 space-y-1">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Proposal Formally Accepted &amp; Executed!</span>
                </div>
                <p className="text-xs">
                  Digitally executed by <strong>{quote.clientSignature || clientSignerName || quote.clientName}</strong> on {formatDate(quote.signedAt || new Date().toISOString())}.
                </p>
                <p className="text-[11px] text-emerald-700 font-mono mt-1">
                  Coil slit allocation secured at The Roofing Store. Production rollforming slot scheduled.
                </p>
              </div>
            ) : (
              <form onSubmit={handleClientAccept} className="space-y-4 print:hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">Authorised Client / Signer Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Julian Vance"
                      value={clientSignerName}
                      onChange={(e) => setClientSignerName(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">Execution Date</label>
                    <input
                      type="text"
                      readOnly
                      value={new Date().toLocaleDateString('en-NZ', { dateStyle: 'full' })}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-700 font-mono text-xs"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer text-slate-700 text-xs p-3 bg-white rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={isSignAgreementChecked}
                    onChange={(e) => setIsSignAgreementChecked(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 mt-0.5 cursor-pointer"
                  />
                  <span className="leading-relaxed">
                    I confirm acceptance of this Proposal, the scheduled Scope of Works packages, payment terms, and Archtech Standard Terms of Trade. Authorises coil procurement at The Roofing Store.
                  </span>
                </label>

                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={!clientSignerName.trim() || !isSignAgreementChecked}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-xs"
                  >
                    Accept &amp; Digitally Execute Proposal
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
