import { 
  Quote, 
  RoofingProfile, 
  CoilMaterial, 
  WindZone, 
  ExposureZone, 
  ProjectCategory,
  ExistingRoofType,
  SpreadsheetSection, 
  SpreadsheetRow,
  FlashingType,
  FlashingGirthTier
} from '../types/crm';
import { 
  calculateDynamicTrayRate, 
  calculateDynamicFlashingRate, 
  calculateDynamicRainwaterRate,
  RE_ROOF_DEMOLITION_RATES
} from './pricingMatrix';

// ============================================================================
// 1. ARCHITECTURAL & PROFILED METAL COMPLIANCE TYPES
// ============================================================================

export type AuditSeverity = 'critical' | 'warning' | 'info' | 'pass';

export interface ComplianceIssue {
  id: string;
  category: 'pitch' | 'durability' | 'wind' | 'thermal' | 'flashings' | 'margin' | 'seam' | 'safety' | 'reroof';
  severity: AuditSeverity;
  title: string;
  description: string;
  codeReference: string; // e.g. "NZBC E2/AS1 Table 7" or "WorkSafe NZ Best Practice Guidelines"
  recommendation: string;
  autoFixLabel?: string;
  appliedFixPatch?: Partial<Quote>;
}

export interface QuoteAuditResult {
  overallScore: number; // 0 - 100
  status: 'compliant' | 'warning' | 'critical';
  summary: string;
  issues: ComplianceIssue[];
  passedChecksCount: number;
  totalChecksCount: number;
}

export interface SmartTakeoffInput {
  category?: ProjectCategory;
  existingRoofType?: ExistingRoofType;
  includeScaffoldingEdgeProtection?: boolean;
  includePurlinScrewDown?: boolean;
  roofAreaM2: number;
  pitchDegrees: number;
  windZone: WindZone;
  exposureZone: ExposureZone;
  preferredProfile: RoofingProfile;
  preferredMaterial: CoilMaterial;
  preferredPanMm?: number;
  wallCladdingAreaM2?: number;
  wallProfile?: RoofingProfile;
  eavesAndRidgeLengthLm?: number;
  storeys?: number;
  includeRainwater?: boolean;
  rainwaterType?: string;
  rainwaterLengthLm?: number;
  targetMarginPercent?: number;
  clientType?: 'architect' | 'commercial_contractor' | 'homeowner';
}

export interface SmartQuoteGenerationResult {
  sections: SpreadsheetSection[];
  rows: SpreadsheetRow[];
  totalTrayM2: number;
  totalTrayLm: number;
  totalFlashingLm: number;
  totalFixingClipsCount: number;
  recommendedPanWidthMm: number;
  suggestedMarkupPercent: number;
  complianceAudit: QuoteAuditResult;
  executiveSummary: string;
}

// ============================================================================
// 2. NZBC E2/AS1, WORKSAFE NZ & NZMRM CODE OF PRACTICE AUDIT ENGINE
// ============================================================================

export function runCodeComplianceAudit(quote: Quote): QuoteAuditResult {
  const issues: ComplianceIssue[] = [];
  let passedChecks = 0;
  const totalChecks = 8;

  const profile = quote.profile || 'Archtech Super Seam 38mm';
  const material = quote.material || 'The Roofing Store MagnaFlow®';
  const windZone = quote.windZone || 'Very High';
  const exposureZone = quote.exposureZone || 'Zone D (Severe Marine)';
  const pitch = (quote as any).pitchDegrees || (quote.scopeZones?.[0]?.pitchDegrees) || 4;
  const panWidthMm = (quote as any).panWidthMm || (quote.scopeZones?.[0]?.trayPanWidthMm) || 450;
  const isReRoof = quote.category === 'Residential Re-Roof' || quote.isReRoof || Boolean(quote.existingRoofType && quote.existingRoofType !== 'None (New Build)');
  const isArchitecturalStandingSeam = 
    profile.includes('Super Seam') || 
    profile.includes('Angle Seam') || 
    profile.includes('Roll Seam') || 
    profile.includes('Interlocking') || 
    profile.includes('Snaplock');
  const isCorrugate = profile.includes('Corrugate');
  const isTrapezoidal = profile.includes('Plumbdeck') || profile.includes('Trimform') || profile.includes('Trapezoidal');

  // 1. MINIMUM ROOF PITCH COMPLIANCE (NZBC E2/AS1 Table 7)
  if (isCorrugate) {
    if (pitch < 8) {
      issues.push({
        id: 'pitch-corrugate-minimum',
        category: 'pitch',
        severity: 'critical',
        title: 'Corrugate Below 8° Absolute Minimum Pitch',
        description: `Current roof pitch is ${pitch}°. NZBC E2/AS1 Table 7 mandates a minimum pitch of 8° for traditional corrugate iron (10° for runs >12m). Below 8°, capillary action and side-lap flooding will cause moisture ingress.`,
        codeReference: 'NZBC E2/AS1 Table 7',
        recommendation: 'Switch to TRS Plumbdeck Trapezoidal (certified down to 3°) or Archtech Super Seam 38mm.',
        autoFixLabel: 'Switch to TRS Plumbdeck 0.55',
        appliedFixPatch: { profile: 'TRS Plumbdeck Trapezoidal 0.55mm' }
      });
    } else {
      passedChecks++;
    }
  } else if (isTrapezoidal) {
    if (pitch < 3) {
      issues.push({
        id: 'pitch-trapezoidal-minimum',
        category: 'pitch',
        severity: 'critical',
        title: 'Trapezoidal Profile Below 3° Absolute Minimum',
        description: `Current pitch is ${pitch}°. NZBC E2/AS1 Table 7 allows crest-fixed trapezoidal profiles down to 3° minimum with continuous unbroken sheets. Below 3°, ponding will void coating warranties.`,
        codeReference: 'NZBC E2/AS1 Table 7',
        recommendation: 'Repitch rafters/purlins to 3° minimum or install an approved membrane roofing substrate.',
        autoFixLabel: 'Lock Warning on Quote'
      });
    } else {
      passedChecks++;
    }
  } else if (profile.includes('Snaplock 25mm')) {
    if (pitch < 8) {
      issues.push({
        id: 'pitch-snaplock-25',
        category: 'pitch',
        severity: 'critical',
        title: 'Snaplock 25mm Minimum Pitch Violation',
        description: `Current roof pitch is ${pitch}°. NZBC E2/AS1 Table 7 and manufacturer specifications require a minimum pitch of 8° for Snaplock 25mm to avoid water ingress at the clip interlock.`,
        codeReference: 'NZBC E2/AS1 Table 7 & MRM COP 8.2',
        recommendation: 'Switch to Archtech Super Seam 38mm (mechanically seamed) which is certified down to 3° pitch.',
        autoFixLabel: 'Switch to Super Seam 38mm',
        appliedFixPatch: { profile: 'Archtech Super Seam 38mm' }
      });
    } else {
      passedChecks++;
    }
  } else if (profile.includes('Snaplock 38mm')) {
    if (pitch < 5) {
      issues.push({
        id: 'pitch-snaplock-38',
        category: 'pitch',
        severity: 'critical',
        title: 'Snaplock 38mm Minimum Pitch Violation',
        description: `Current roof pitch is ${pitch}°. Snaplock 38mm requires a minimum pitch of 5°.`,
        codeReference: 'NZBC E2/AS1 Table 7',
        recommendation: 'Upgrade to Archtech Super Seam 38mm (seamed) for pitches between 3° and 5°.',
        autoFixLabel: 'Switch to Super Seam 38mm',
        appliedFixPatch: { profile: 'Archtech Super Seam 38mm' }
      });
    } else {
      passedChecks++;
    }
  } else if (profile.includes('Super Seam') || profile.includes('Standing Seam')) {
    if (pitch < 3) {
      issues.push({
        id: 'pitch-super-seam',
        category: 'pitch',
        severity: 'critical',
        title: 'Standing Seam Below 3° Absolute Minimum',
        description: `Pitch is ${pitch}°. NZBC E2/AS1 mandates a strict 3° minimum fall for all standing seam metal roofs. Below 3°, ponding will void metal substrate warranties.`,
        codeReference: 'NZBC E2/AS1 Clause 8.4.4',
        recommendation: 'Notify structural engineer/builder to adjust purlin falls or install a membrane roof substrate.',
        autoFixLabel: 'Lock Warning on Quote'
      });
    } else if (pitch < 5) {
      // 3° to 5° requires continuous butyl sealant at laps and eave turn-downs
      issues.push({
        id: 'pitch-low-slope-sealant',
        category: 'pitch',
        severity: 'warning',
        title: 'Low Slope Sealant Requirement (3° - 5°)',
        description: `Roof pitch is ${pitch}°. At low pitches under 5°, NZMRM Code of Practice requires double-lock mechanical seaming with continuous non-skinning butyl mastic in all seams and eave turn-downs.`,
        codeReference: 'NZMRM Code of Practice Clause 8.4.6',
        recommendation: 'Ensure butyl sealant infill and double-locking seamer tool allowance are itemized in scope.',
        autoFixLabel: 'Verify Sealant Allowance'
      });
      passedChecks++;
    } else {
      passedChecks++;
    }
  } else {
    passedChecks++;
  }

  // 2. ENVIRONMENTAL DURABILITY & COATING COMPLIANCE (NZS 3604 Section 4)
  const isSevereMarine = exposureZone.includes('Zone D') || exposureZone.includes('Zone E') || exposureZone.includes('Severe');
  if (isSevereMarine) {
    if (material.includes('Vitor+') && !material.includes('MagnaFlow') && !material.includes('Duralume') && !material.includes('Euramax')) {
      issues.push({
        id: 'durability-marine-substrate',
        category: 'durability',
        severity: 'warning',
        title: 'Coil Coating Warning for Severe Marine Zone D',
        description: `Project is located in ${exposureZone}. Standard Vitor+ provides 15-year durability in coastal conditions. The Roofing Store MagnaFlow® (Magnesium-Zinc-Aluminium alloy) is recommended for 25-year manufacturer guarantee within 500m of breaking surf.`,
        codeReference: 'NZS 3604 Section 4 & TRS Warranty Schedule',
        recommendation: 'Upgrade coil substrate to The Roofing Store MagnaFlow® or Euramax Architectural Aluminum.',
        autoFixLabel: 'Upgrade to MagnaFlow® Substrate',
        appliedFixPatch: { material: 'The Roofing Store MagnaFlow®' }
      });
    } else {
      passedChecks++;
    }
  } else {
    passedChecks++;
  }

  // 3. WIND UPLIFT & OIL-CANNING PAN WIDTH AUDIT
  const isHighWind = windZone === 'Very High' || windZone === 'Extra High';
  if (isArchitecturalStandingSeam && isHighWind && panWidthMm > 450) {
    issues.push({
      id: 'wind-pan-width',
      category: 'wind',
      severity: 'warning',
      title: 'Wide Pan Oil-Canning Risk in High Wind Zone',
      description: `In ${windZone} wind zones, 500mm+ wide pan standing seam trays experience suction flutter, causing visible oil-canning and micro-vibration.`,
      codeReference: 'AS/NZS 1170.2 & NZMRM Section 5.3',
      recommendation: 'Specify 300mm or 400mm pan width with stiffening swages or reduce clip centers to 350mm c/c.',
      autoFixLabel: 'Optimize to 400mm Pan Width'
    });
  } else {
    passedChecks++;
  }

  // 4. FASTENING SYSTEM AUDIT (Architectural Clips vs Profiled Screws)
  const rows = quote.quoteRows || quote.spreadsheetRows || [];
  if (isArchitecturalStandingSeam) {
    const hasSlidingClips = rows.some(r => r.description.toLowerCase().includes('sliding') || r.description.toLowerCase().includes('cleat'));
    if (quote.roofAreaM2 > 100 && !hasSlidingClips) {
      issues.push({
        id: 'thermal-sliding-clips',
        category: 'thermal',
        severity: 'warning',
        title: 'Missing Thermal Expansion Sliding Clips',
        description: 'Standing seam trays expand up to 1.2mm per linear metre. Continuous trays over 6m require 316 stainless two-piece sliding expansion clips to prevent fastener shear and pan puckering.',
        codeReference: 'NZMRM Code of Practice Clause 8.5.2',
        recommendation: 'Add Concealed 316 Stainless Sliding Clips item to Hardware & Fixings schedule.',
        autoFixLabel: 'Add Marine Sliding Clips Item'
      });
    } else {
      passedChecks++;
    }
  } else {
    // Standard Profiled Long-Run (Corrugate / Trapezoidal)
    const hasScrews = rows.some(r => r.description.toLowerCase().includes('screw') || r.description.toLowerCase().includes('fastener') || r.description.toLowerCase().includes('hex'));
    if (!hasScrews && rows.length > 0) {
      issues.push({
        id: 'profiled-fasteners',
        category: 'flashings',
        severity: 'info',
        title: 'Verify Class 4 / 5 Roofing Screws Allowance',
        description: 'Profiled metal roofing requires Class 4 (inland) or Class 5 / 316 stainless (coastal) hex-head fasteners with integrated EPDM washers.',
        codeReference: 'AS 3566.2 & NZBC E2/AS1 Table 20',
        recommendation: 'Ensure profiled roofing screws are itemized in fixings schedule.',
        autoFixLabel: 'Verify Fasteners'
      });
    } else {
      passedChecks++;
    }
  }

  // 5. WORKSAFE NZ RE-ROOF HEIGHT SAFETY & EDGE PROTECTION AUDIT
  if (isReRoof) {
    const hasEdgeProtection = rows.some(r => 
      r.description.toLowerCase().includes('edge protection') || 
      r.description.toLowerCase().includes('scaffold') ||
      r.description.toLowerCase().includes('fall protection')
    );
    if (!hasEdgeProtection) {
      issues.push({
        id: 'reroof-edge-protection',
        category: 'safety',
        severity: 'warning',
        title: 'Missing WorkSafe NZ Edge Protection / Scaffolding for Re-Roof',
        description: 'WorkSafe NZ Best Practice Guidelines for Working at Height require perimeter edge protection or scaffolding on all residential re-roofing operations.',
        codeReference: 'WorkSafe NZ Guidelines & HSW Act 2015',
        recommendation: 'Itemize certified perimeter tubular edge protection or scaffolding.',
        autoFixLabel: 'Add WorkSafe Edge Protection'
      });
    } else {
      passedChecks++;
    }
  } else {
    passedChecks++;
  }

  // 5. FLASHINGS VENTILATION AUDIT
  const hasVentilatedRidge = rows.some(r => r.description.toLowerCase().includes('vent') && r.description.toLowerCase().includes('ridge')) ||
    (quote.flashings || []).some(f => f.type === 'Ridge Cap Vent');
  if (!hasVentilatedRidge) {
    issues.push({
      id: 'flashings-ridge-ventilation',
      category: 'flashings',
      severity: 'info',
      title: 'Recommend Ventilated Ridge Cap System',
      description: 'NZBC E2/AS1 Amendment 7 highlights condensation control in tight modern envelopes. A ventilated ridge cap with reticulated insect mesh ensures continuous passive attic airflow.',
      codeReference: 'NZBC E2/AS1 Verification Method & BRANZ Bulletin 637',
      recommendation: 'Specify Ventilated Ridge Cap Flashing with integrated ventilation mesh.',
      autoFixLabel: 'Switch to Ridge Cap Vent'
    });
  } else {
    passedChecks++;
  }

  // 6. CCA 2002 PAYMENT MILESTONES & VALIDITY AUDIT
  if (!quote.validUntil && !quote.expiresAt) {
    issues.push({
      id: 'legal-quote-validity',
      category: 'margin',
      severity: 'warning',
      title: 'Missing 30-Day Expiry Guarantee Date',
      description: 'Under New Zealand construction law and steel mill coil agreements, material supply rates must be bounded by a 30-day validity window to protect against coil surcharges.',
      codeReference: 'NZ Construction Contracts Act 2002 (CCA)',
      recommendation: 'Ensure 30-day validity date is stamped on client proposal.',
      autoFixLabel: 'Stamp 30-Day Expiry'
    });
  } else {
    passedChecks++;
  }

  // 7. MARGIN & PROFITABILITY HEALTH CHECK
  const margin = quote.marginPercent || ((quote.totalNZD - (quote.materialTotalNZD || 0)) / (quote.totalNZD || 1)) * 100;
  if (margin < 15) {
    issues.push({
      id: 'margin-under-target',
      category: 'margin',
      severity: 'warning',
      title: 'Gross Margin Below Architectural Target (<15%)',
      description: `Current gross margin is estimated at ${margin.toFixed(1)}%. Specialized standing seam installation and custom flashings carry higher liability and should target 18% to 25% gross margin.`,
      codeReference: 'Archtech Commercial Financial Policy',
      recommendation: 'Adjust trade markup to 20% to safeguard against coil wastage and site delay risks.',
      autoFixLabel: 'Optimize Margin to 20%'
    });
  } else {
    passedChecks++;
  }

  // Calculate Overall Score
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  let overallScore = 100 - (criticalCount * 30) - (warningCount * 10);
  if (overallScore < 0) overallScore = 0;

  const status = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'compliant';
  const summary = status === 'compliant'
    ? 'All NZBC E2/AS1, NZMRM Code of Practice, and manufacturer warranty criteria fully satisfied.'
    : `${criticalCount > 0 ? `${criticalCount} critical code issue(s)` : ''} ${warningCount > 0 ? `${warningCount} engineering warning(s)` : ''} flagged.`;

  return {
    overallScore,
    status,
    summary,
    issues,
    passedChecksCount: passedChecks,
    totalChecksCount: totalChecks
  };
}

// ============================================================================
// 3. SMART SCOPE GENERATOR & AUTOMATED TAKEOFF ENGINE
// ============================================================================

export function generateSmartScopeOfWorks(input: SmartTakeoffInput): SmartQuoteGenerationResult {
  const {
    category = 'Architectural Bespoke',
    existingRoofType = category === 'Residential Re-Roof' ? 'Corrugated Iron' : 'None (New Build)',
    includeScaffoldingEdgeProtection = true,
    includePurlinScrewDown = true,
    roofAreaM2,
    pitchDegrees,
    windZone,
    exposureZone,
    preferredProfile,
    preferredMaterial,
    wallCladdingAreaM2 = 0,
    wallProfile = 'Archtech Interlocking Panels',
    eavesAndRidgeLengthLm = Math.round(Math.sqrt(roofAreaM2) * 2.2),
    storeys = category === 'Residential Re-Roof' ? 1 : 2,
    includeRainwater = true,
    rainwaterType = category === 'Residential Re-Roof' ? 'Colorsteel 150mm Quarter-Round Spouting' : 'Archtech 150mm Continuous Box Gutter',
    rainwaterLengthLm = Math.round(Math.sqrt(roofAreaM2) * 1.8),
    targetMarginPercent = category === 'Residential Re-Roof' ? 22 : 20
  } = input;

  const isReRoof = category === 'Residential Re-Roof' || (existingRoofType && existingRoofType !== 'None (New Build)');
  const isCorrugate = preferredProfile.includes('Corrugate');
  const isTrapezoidal = preferredProfile.includes('Plumbdeck') || preferredProfile.includes('Trimform') || preferredProfile.includes('Trapezoidal');
  const isStandardProfiled = isCorrugate || isTrapezoidal;

  // Determine optimal pan / cover width based on profile
  let recommendedPanWidthMm = input.preferredPanMm || (isStandardProfiled ? 762 : 450);
  if (!isStandardProfiled && (windZone === 'Very High' || windZone === 'Extra High') && recommendedPanWidthMm > 450) {
    recommendedPanWidthMm = 400;
  }

  // Effective slope area calculation: A_slope = A_flat / cos(pitch)
  const slopeMultiplier = 1 / Math.cos((pitchDegrees * Math.PI) / 180);
  const effectiveRoofAreaM2 = Math.round(roofAreaM2 * slopeMultiplier * 10) / 10;
  
  // Tray / Sheet linear metres calculation
  const panWidthMetres = recommendedPanWidthMm / 1000;
  const rawTrayLm = effectiveRoofAreaM2 / panWidthMetres;
  const trayWastageFactor = isStandardProfiled ? 1.05 : 1.08; // 5% for long-run corrugate/trapezoidal, 8% for standing seam
  const totalTrayLm = Math.round(rawTrayLm * trayWastageFactor * 10) / 10;

  // Fasteners: Screws for long-run profiled iron vs 316 sliding cleats for standing seam
  const totalFixingClipsCount = isStandardProfiled
    ? Math.round(effectiveRoofAreaM2 * 6.5) // ~6.5 roofing screws per m2
    : Math.round(totalTrayLm / (windZone === 'Extra High' ? 0.35 : 0.45)); // sliding clips every 350-450mm

  // Dynamic Tray Rate from matrix
  const trayRate = calculateDynamicTrayRate(preferredProfile, preferredMaterial, recommendedPanWidthMm);

  const allSections: SpreadsheetSection[] = [];
  const allRows: SpreadsheetRow[] = [];

  // --------------------------------------------------------------------------
  // SECTION A: DEMOLITION, STRIP & SITE PREPARATION (FOR RE-ROOFS)
  // --------------------------------------------------------------------------
  if (isReRoof && existingRoofType && existingRoofType !== 'None (New Build)') {
    const demoSectionId = 'sec-smart-demo';
    const demoRateInfo = RE_ROOF_DEMOLITION_RATES[existingRoofType] || {
      stripRatePerM2: 15.00,
      disposalRatePerM2: 9.00,
      description: 'Strip existing roofing material and clear to registered recycling/cleanfill'
    };

    const demoSection: SpreadsheetSection = {
      id: demoSectionId,
      title: 'Demolition, Strip & Safe Disposal (Re-Roof)',
      colorTag: '#ef4444',
      sectionType: 'labour',
      totalM2: effectiveRoofAreaM2
    };
    allSections.push(demoSection);

    allRows.push(
      {
        id: 'row-smart-strip',
        sectionId: demoSectionId,
        itemCode: 'DEMO-STRIP-ROOF',
        description: `Strip Existing ${existingRoofType} Roof Covering: ${demoRateInfo.description}`,
        category: 'Labour',
        quantity: effectiveRoofAreaM2,
        unit: 'm2',
        wastagePercent: 0,
        unitCostNZD: Math.round(demoRateInfo.stripRatePerM2 * 0.75 * 100) / 100,
        markupPercent: 25,
        unitSellNZD: demoRateInfo.stripRatePerM2,
        totalNZD: Math.round(effectiveRoofAreaM2 * demoRateInfo.stripRatePerM2 * 100) / 100
      },
      {
        id: 'row-smart-dump',
        sectionId: demoSectionId,
        itemCode: 'DEMO-CARTAGE-BIN',
        description: `Heavy Debris Skip Bins, Cartage & Cleanfill Disposal Fees (${existingRoofType})`,
        category: 'Freight',
        quantity: effectiveRoofAreaM2,
        unit: 'm2',
        wastagePercent: 0,
        unitCostNZD: Math.round(demoRateInfo.disposalRatePerM2 * 0.80 * 100) / 100,
        markupPercent: 20,
        unitSellNZD: demoRateInfo.disposalRatePerM2,
        totalNZD: Math.round(effectiveRoofAreaM2 * demoRateInfo.disposalRatePerM2 * 100) / 100
      }
    );

    if (includePurlinScrewDown) {
      allRows.push({
        id: 'row-smart-purlins',
        sectionId: demoSectionId,
        itemCode: 'SUB-PURLIN-FIX',
        description: 'Purlin Structural Remediation: Inspect existing framing, re-screw all purlins with 14g x 75mm bugle screws into rafters',
        category: 'Labour',
        quantity: effectiveRoofAreaM2,
        unit: 'm2',
        wastagePercent: 0,
        unitCostNZD: 6.20,
        markupPercent: 30,
        unitSellNZD: 8.50,
        totalNZD: Math.round(effectiveRoofAreaM2 * 8.50 * 100) / 100
      });
    }
  }

  // --------------------------------------------------------------------------
  // SECTION B: WORKSAFE NZ HEIGHT SAFETY & SCAFFOLDING
  // --------------------------------------------------------------------------
  const perimeterLm = Math.round(Math.sqrt(roofAreaM2) * 4.2);
  if (includeScaffoldingEdgeProtection) {
    const safetySectionId = 'sec-smart-safety';
    const safetySection: SpreadsheetSection = {
      id: safetySectionId,
      title: 'WorkSafe NZ Height Safety & Edge Protection',
      colorTag: '#f97316',
      sectionType: 'custom'
    };
    allSections.push(safetySection);

    allRows.push({
      id: 'row-smart-edge-prot',
      sectionId: safetySectionId,
      itemCode: 'SAF-EDGE-PROT',
      description: `Certified Tubular Perimeter Edge Protection & Handrail System (WorkSafe NZ compliant, ${storeys}-Storey)`,
      category: 'Preliminaries',
      quantity: perimeterLm,
      unit: 'lm',
      wastagePercent: 0,
      unitCostNZD: 16.50,
      markupPercent: 25,
      unitSellNZD: 22.00,
      totalNZD: Math.round(perimeterLm * 22.00 * 100) / 100
    });
  }

  // --------------------------------------------------------------------------
  // SECTION C: ROOF ENVELOPE SYSTEM
  // --------------------------------------------------------------------------
  const roofSectionId = 'sec-smart-roof';
  const roofSection: SpreadsheetSection = {
    id: roofSectionId,
    title: isReRoof ? 'New Profiled Metal Roof Covering' : 'Roof Envelope System',
    colorTag: '#0284c7',
    sectionType: 'roof',
    totalM2: effectiveRoofAreaM2,
    defaultMaterial: preferredMaterial,
    defaultProfile: preferredProfile,
    defaultPanSizeMm: recommendedPanWidthMm
  };
  allSections.push(roofSection);

  const roofDescription = isStandardProfiled
    ? `${preferredProfile} Continuous Custom-Cut Profiled Iron (${recommendedPanWidthMm}mm effective cover, 0.40/0.55mm)`
    : `${preferredProfile} Continuous Standing Seam Trays (${recommendedPanWidthMm}mm pan width, architectural grade)`;

  allRows.push({
    id: 'row-smart-tray',
    sectionId: roofSectionId,
    itemCode: isStandardProfiled ? 'LONG-RUN-SHEET' : 'TRAY-ROLLFORM',
    description: roofDescription,
    category: 'Material',
    quantity: totalTrayLm,
    unit: 'lm',
    wastagePercent: isStandardProfiled ? 5 : 8,
    unitCostNZD: Math.round(trayRate.ratePerLm * 0.78 * 100) / 100,
    markupPercent: targetMarginPercent,
    unitSellNZD: trayRate.ratePerLm,
    totalNZD: Math.round(totalTrayLm * trayRate.ratePerLm * 100) / 100,
    formula: `=${totalTrayLm}*${trayRate.ratePerLm}`,
    isMatrixItem: true,
    matrixType: 'tray',
    profile: preferredProfile,
    material: preferredMaterial,
    panSizeMm: recommendedPanWidthMm
  });

  // --------------------------------------------------------------------------
  // SECTION D: OPTIONAL VERTICAL FACADE / WALL CLADDING
  // --------------------------------------------------------------------------
  if (wallCladdingAreaM2 > 0) {
    const wallSectionId = 'sec-smart-wall';
    const wallPanMm = 300;
    const rawWallLm = wallCladdingAreaM2 / (wallPanMm / 1000);
    const wallLm = Math.round(rawWallLm * 1.10 * 10) / 10;
    const wallRate = calculateDynamicTrayRate(wallProfile, preferredMaterial, wallPanMm);

    const wallSection: SpreadsheetSection = {
      id: wallSectionId,
      title: 'Architectural Vertical Wall Cladding',
      colorTag: '#475569',
      sectionType: 'wall_cladding',
      totalM2: wallCladdingAreaM2,
      defaultMaterial: preferredMaterial,
      defaultProfile: wallProfile,
      defaultPanSizeMm: wallPanMm
    };
    allSections.push(wallSection);

    allRows.push({
      id: 'row-smart-wall',
      sectionId: wallSectionId,
      itemCode: 'WALL-CLAD',
      description: `${wallProfile} Interlocking Panels (${wallPanMm}mm reveal, 25mm shadow express)`,
      category: 'Material',
      quantity: wallLm,
      unit: 'lm',
      wastagePercent: 10,
      unitCostNZD: Math.round(wallRate.ratePerLm * 0.78 * 100) / 100,
      markupPercent: targetMarginPercent,
      unitSellNZD: wallRate.ratePerLm,
      totalNZD: Math.round(wallLm * wallRate.ratePerLm * 100) / 100,
      formula: `=${wallLm}*${wallRate.ratePerLm}`,
      isMatrixItem: true,
      matrixType: 'tray',
      profile: wallProfile,
      material: preferredMaterial,
      panSizeMm: wallPanMm
    });
  }

  // --------------------------------------------------------------------------
  // SECTION E: PERIMETER FLASHINGS & RIDGING
  // --------------------------------------------------------------------------
  const flashingsSectionId = 'sec-smart-flashings';
  const ridgeLm = Math.round(eavesAndRidgeLengthLm * 0.45);
  const bargeLm = Math.round(eavesAndRidgeLengthLm * 0.55);
  const apronLm = Math.round(eavesAndRidgeLengthLm * 0.35);
  const totalFlashingLm = ridgeLm + bargeLm + apronLm;

  const ridgeRate = calculateDynamicFlashingRate('Ridge Cap Vent', preferredMaterial, '301-450mm', 4);
  const bargeRate = calculateDynamicFlashingRate('Barge Flashing / Roll', preferredMaterial, '151-300mm', 4);
  const apronRate = calculateDynamicFlashingRate('Apron / Abutment Flashing', preferredMaterial, '151-300mm', 3);

  const flashingsSection: SpreadsheetSection = {
    id: flashingsSectionId,
    title: 'Perimeter Flashings & Weatherproofing',
    colorTag: '#d97706',
    sectionType: 'flashings',
    defaultMaterial: preferredMaterial
  };
  allSections.push(flashingsSection);

  allRows.push(
    {
      id: 'row-smart-fl-ridge',
      sectionId: flashingsSectionId,
      itemCode: 'FL-RIDGE-VENT',
      description: isStandardProfiled
        ? `Custom Profile-Matched Ridge Capping with Soft Edge / Foam Infill (301-450mm girth)`
        : `Ventilated Ridge Cap Flashing with Reticulated Insect Mesh (301-450mm girth)`,
      category: 'Flashings',
      quantity: ridgeLm,
      unit: 'lm',
      wastagePercent: 8,
      unitCostNZD: Math.round(ridgeRate.ratePerLm * 0.75 * 100) / 100,
      markupPercent: 25,
      unitSellNZD: ridgeRate.ratePerLm,
      totalNZD: Math.round(ridgeLm * ridgeRate.ratePerLm * 100) / 100,
      isMatrixItem: true,
      matrixType: 'flashing',
      material: preferredMaterial
    },
    {
      id: 'row-smart-fl-barge',
      sectionId: flashingsSectionId,
      itemCode: 'FL-BARGE',
      description: isStandardProfiled
        ? `Custom Profiled Barge Roll Flashing (151-300mm girth)`
        : `Continuous Concealed Barge Roll Flashing & Secret Fix Hook (151-300mm girth)`,
      category: 'Flashings',
      quantity: bargeLm,
      unit: 'lm',
      wastagePercent: 8,
      unitCostNZD: Math.round(bargeRate.ratePerLm * 0.75 * 100) / 100,
      markupPercent: 25,
      unitSellNZD: bargeRate.ratePerLm,
      totalNZD: Math.round(bargeLm * bargeRate.ratePerLm * 100) / 100,
      isMatrixItem: true,
      matrixType: 'flashing',
      material: preferredMaterial
    },
    {
      id: 'row-smart-fl-apron',
      sectionId: flashingsSectionId,
      itemCode: 'FL-APRON',
      description: `Wall Abutment & Apron Flashing with 150mm Upstand per NZBC E2/AS1 (151-300mm girth)`,
      category: 'Flashings',
      quantity: apronLm,
      unit: 'lm',
      wastagePercent: 8,
      unitCostNZD: Math.round(apronRate.ratePerLm * 0.75 * 100) / 100,
      markupPercent: 25,
      unitSellNZD: apronRate.ratePerLm,
      totalNZD: Math.round(apronLm * apronRate.ratePerLm * 100) / 100,
      isMatrixItem: true,
      matrixType: 'flashing',
      material: preferredMaterial
    }
  );

  // --------------------------------------------------------------------------
  // SECTION F: RAINWATER SYSTEM (SPOUTING & DOWNPIPES)
  // --------------------------------------------------------------------------
  if (includeRainwater && rainwaterLengthLm > 0) {
    const rainSectionId = 'sec-smart-rainwater';
    const rainRate = calculateDynamicRainwaterRate(
      isReRoof ? '150mm Colorsteel Quarter-Round Spouting' : '150mm European Half-Round Spouting', 
      preferredMaterial
    );
    const rainSection: SpreadsheetSection = {
      id: rainSectionId,
      title: 'Rainwater Drainage & Downpipes',
      colorTag: '#0891b2',
      sectionType: 'rainwater',
      defaultMaterial: preferredMaterial
    };
    allSections.push(rainSection);

    allRows.push(
      {
        id: 'row-smart-spouting',
        sectionId: rainSectionId,
        itemCode: 'RAIN-SPOUT-150',
        description: `${rainwaterType} with External Color-Matched Brackets & Expansion Outlets`,
        category: 'Rainwater',
        quantity: rainwaterLengthLm,
        unit: 'lm',
        wastagePercent: 5,
        unitCostNZD: Math.round(rainRate.ratePerUnit * 0.72 * 100) / 100,
        markupPercent: 28,
        unitSellNZD: rainRate.ratePerUnit,
        totalNZD: Math.round(rainwaterLengthLm * rainRate.ratePerUnit * 100) / 100,
        isMatrixItem: true,
        matrixType: 'rainwater',
        material: preferredMaterial
      },
      {
        id: 'row-smart-downpipes',
        sectionId: rainSectionId,
        itemCode: 'RAIN-DP-80',
        description: `80mm Round / 100x75mm Architectural Color-Matched Downpipes with Stand-Off Brackets`,
        category: 'Rainwater',
        quantity: Math.max(4, Math.round(rainwaterLengthLm / 8) * 3), // 3m drop per downpipe outlet
        unit: 'lm',
        wastagePercent: 5,
        unitCostNZD: 28.00,
        markupPercent: 25,
        unitSellNZD: 38.00,
        totalNZD: Math.round(Math.max(4, Math.round(rainwaterLengthLm / 8) * 3) * 38.00 * 100) / 100,
        material: preferredMaterial
      }
    );
  }

  // --------------------------------------------------------------------------
  // SECTION G: UNDERLAY & FASTENING HARDWARE
  // --------------------------------------------------------------------------
  const underlaySectionId = 'sec-smart-fastenings';
  const underlayM2 = Math.round(effectiveRoofAreaM2 * 1.15); // 15% lap allowance
  const underlaySection: SpreadsheetSection = {
    id: underlaySectionId,
    title: 'Underlay, Fasteners & Weatherproofing Hardware',
    colorTag: '#059669',
    sectionType: 'hardware'
  };
  allSections.push(underlaySection);

  allRows.push({
    id: 'row-smart-underlay',
    sectionId: underlaySectionId,
    itemCode: 'UND-SYNTHETIC',
    description: isReRoof
      ? 'CoverTek 407 / Thermakraft Heavy-Duty Self-Supporting Synthetic Breathable Roof Underlay (150mm taped laps)'
      : 'CoverTek 407 Heavy Duty Micro-Porous Synthetic Roof Underlay (150mm taped laps)',
    category: 'Hardware',
    quantity: underlayM2,
    unit: 'm2',
    wastagePercent: 10,
    unitCostNZD: 5.20,
    markupPercent: 25,
    unitSellNZD: 6.90,
    totalNZD: Math.round(underlayM2 * 6.90 * 100) / 100
  });

  if (isStandardProfiled) {
    // Hex-head screws with EPDM washers for long-run corrugate/trapezoidal
    allRows.push({
      id: 'row-smart-screws',
      sectionId: underlaySectionId,
      itemCode: 'FAST-HEX-NEO',
      description: 'Class 4 Galvanised Hex-Head Roofing Screws with Integrated EPDM Neo-Washers (Crest fixed into timber purlins)',
      category: 'Hardware',
      quantity: totalFixingClipsCount,
      unit: 'each',
      wastagePercent: 5,
      unitCostNZD: 0.28,
      markupPercent: 30,
      unitSellNZD: 0.42,
      totalNZD: Math.round(totalFixingClipsCount * 0.42 * 100) / 100
    });
  } else {
    // 316 Marine sliding clips for architectural standing seam
    allRows.push({
      id: 'row-smart-clips',
      sectionId: underlaySectionId,
      itemCode: 'CLIP-316-SLIDE',
      description: 'Marine Grade 316 Stainless Steel Two-Piece Sliding Expansion Cleats & Class 4 Screws',
      category: 'Hardware',
      quantity: totalFixingClipsCount,
      unit: 'each',
      wastagePercent: 5,
      unitCostNZD: 1.45,
      markupPercent: 30,
      unitSellNZD: 2.10,
      totalNZD: Math.round(totalFixingClipsCount * 2.10 * 100) / 100
    });
  }

  // --------------------------------------------------------------------------
  // SECTION H: LICENSED BUILDING PRACTITIONER (LBP) TRADE INSTALLATION
  // --------------------------------------------------------------------------
  const labourSectionId = 'sec-smart-labour';
  const labourRatePerM2 = isReRoof ? 0.70 : isStandardProfiled ? 0.65 : 0.85;
  const labourHours = Math.round(effectiveRoofAreaM2 * labourRatePerM2 + (wallCladdingAreaM2 * 1.25) + (totalFlashingLm * 0.35));
  const hourlySellRate = 88.00;
  const craneFreightCost = storeys > 1 ? 1450 : 850;

  const labourSection: SpreadsheetSection = {
    id: labourSectionId,
    title: 'Certified Installation & Council PS3 Sign-off',
    colorTag: '#7c3aed',
    sectionType: 'labour'
  };
  allSections.push(labourSection);

  const labourDesc = isReRoof
    ? 'Licensed Building Practitioner (LBP) Installation: Staged Daily Weather-tight Strip & Lay, Profiled Sheet Fixing & Flashing Terminations'
    : isStandardProfiled
      ? 'Licensed Building Practitioner (LBP) Installation: Continuous Long-Run Profile Laying, Ridge/Eaves Scribing & Fastener Alignment'
      : 'Licensed Building Practitioner (LBP) Installation, Tray Laying & Double-Lock Mechanical Seaming';

  allRows.push(
    {
      id: 'row-smart-labour',
      sectionId: labourSectionId,
      itemCode: 'LAB-LBP-INSTALL',
      description: labourDesc,
      category: 'Labour',
      quantity: labourHours,
      unit: 'hrs',
      wastagePercent: 0,
      unitCostNZD: 58.00,
      markupPercent: 34,
      unitSellNZD: hourlySellRate,
      totalNZD: Math.round(labourHours * hourlySellRate * 100) / 100
    },
    {
      id: 'row-smart-crane',
      sectionId: labourSectionId,
      itemCode: 'FRT-HIAB-LIFT',
      description: `Specialized Transport & HIAB Rooftop Crane Lift (${storeys}-Storey Delivery)`,
      category: 'Freight',
      quantity: 1,
      unit: 'item',
      wastagePercent: 0,
      unitCostNZD: Math.round(craneFreightCost * 0.82),
      markupPercent: 18,
      unitSellNZD: craneFreightCost,
      totalNZD: craneFreightCost
    },
    {
      id: 'row-smart-ps3',
      sectionId: labourSectionId,
      itemCode: 'DOC-PS3-COUNCIL',
      description: 'Licensed Building Practitioner Sign-off & Council Producer Statement PS3 by Marcus Kuhtze (BP134821)',
      category: 'Preliminaries',
      quantity: 1,
      unit: 'item',
      wastagePercent: 0,
      unitCostNZD: 0,
      markupPercent: 0,
      unitSellNZD: 550.00,
      totalNZD: 550.00
    }
  );

  // Compute mock quote for audit
  const grandTotal = allRows.reduce((sum, r) => sum + r.totalNZD, 0);
  const mockQuote: Quote = {
    id: 'mock-audit-id',
    quoteNumber: 'Q-SMART-TAKEOFF',
    status: 'draft',
    clientName: 'Prospective Client',
    clientEmail: 'client@example.co.nz',
    clientPhone: '+64 9 000 0000',
    architect: category === 'Architectural Bespoke' ? 'Architectural Studio' : 'N/A (Re-Roof)',
    siteAddress: 'New Zealand Site',
    region: 'Auckland',
    category,
    existingRoofType,
    isReRoof,
    windZone,
    exposureZone,
    accessDifficulty: storeys > 1 ? 'Two Storey Standard' : 'Single Storey Easy',
    scopeZones: [],
    flashings: [],
    hardwareItems: [],
    freightItems: [],
    labourItems: [],
    upgrades: [],
    quoteSections: allSections,
    quoteRows: allRows,
    roofAreaM2: effectiveRoofAreaM2,
    profile: preferredProfile,
    material: preferredMaterial,
    colorName: 'Slate Grey / Ebony',
    materialTotalNZD: Math.round(totalTrayLm * trayRate.ratePerLm),
    flashingsTotalNZD: Math.round(totalFlashingLm * 45),
    hardwareTotalNZD: Math.round(totalFixingClipsCount * (isStandardProfiled ? 0.42 : 2.10) + underlayM2 * 6.90),
    labourTotalNZD: Math.round(labourHours * hourlySellRate),
    freightTotalNZD: craneFreightCost,
    subtotalNZD: grandTotal,
    gstNZD: Math.round(grandTotal * 0.15 * 100) / 100,
    totalNZD: Math.round(grandTotal * 1.15 * 100) / 100,
    markupPercent: targetMarginPercent,
    marginPercent: targetMarginPercent,
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
  };

  const complianceAudit = runCodeComplianceAudit(mockQuote);

  const executiveSummary = isReRoof
    ? `Turnkey residential re-roofing proposal specifying the safe strip of ${existingRoofType || 'existing roof'} (${effectiveRoofAreaM2} m²), timber purlin remediation, WorkSafe NZ perimeter edge protection, and installation of ${preferredProfile} in 0.55mm ${preferredMaterial}. Package includes ${totalFlashingLm} lm of custom flashings, ${rainwaterLengthLm} lm of spouting, full clean-site magnetic nail sweep, and Licensed Building Practitioner (LBP BP134821) Producer Statement PS3 sign-off.`
    : `Comprehensive engineered metal envelope quotation specifying ${effectiveRoofAreaM2} m² of ${preferredProfile} roll-formed in 0.55mm ${preferredMaterial}. Package includes ${totalTrayLm} lm of ${isStandardProfiled ? 'continuous profiled sheets' : 'standing seam trays with 316 stainless sliding cleats'}, ${totalFlashingLm} lm of custom workshop flashings, and full Licensed Building Practitioner supervision with Council Producer Statement PS3 sign-off.`;

  return {
    sections: allSections,
    rows: allRows,
    totalTrayM2: effectiveRoofAreaM2,
    totalTrayLm,
    totalFlashingLm,
    totalFixingClipsCount,
    recommendedPanWidthMm,
    suggestedMarkupPercent: targetMarginPercent,
    complianceAudit,
    executiveSummary
  };
}

// ============================================================================
// 4. GEMINI AI CLIENT INTEGRATION FOR SMART ASSISTED PROPOSALS
// ============================================================================

export async function generateAIAssistedProposal(options: {
  quote: Quote;
  clientType: 'architect' | 'commercial_contractor' | 'homeowner';
  tone?: 'rigorous' | 'premium' | 'collaborative';
}): Promise<string> {
  const { quote, clientType, tone = 'premium' } = options;
  const isReRoof = quote.category === 'Residential Re-Roof' || quote.isReRoof || Boolean(quote.existingRoofType && quote.existingRoofType !== 'None (New Build)');

  const getFallbackLetter = () => {
    if (isReRoof || clientType === 'homeowner') {
      return `Thank you for inviting Archtech to provide a comprehensive re-roofing proposal for your home at ${quote.siteAddress || 'your property'}.\n\nArchtech specializes in all profiled metal roofing — delivering turn-key strip-and-replace solutions with complete peace of mind. We carefully stage our work each day to ensure your home remains completely weather-tight throughout the project. Our team provides WorkSafe-certified perimeter edge protection, thorough structural purlin inspections, and daily magnetic sweeps of your grounds to keep your family and pets safe.\n\nYour new ${quote.profile} roof in ${quote.material} is sourced directly from The Roofing Store, backed by up to 35-year manufacturer warranties and a 10-Year Archtech Workmanship Guarantee supervised by Licensed Building Practitioner Marcus Kuhtze (BP134821).`;
    } else if (clientType === 'architect') {
      return `Thank you for presenting Archtech with the opportunity to tender for the metal roofing and cladding package at ${quote.siteAddress || 'the subject project'}.\n\nArchtech is an accredited specialist in all profiled metal roofing with dedicated mastery in bespoke architectural standing seam, tray profiles, and custom-folded junctions. Sourced in partnership with The Roofing Store (NZ), our coil substrates (including Vitor+® and MagnaFlow®) are engineered to withstand New Zealand's severe marine and high-wind environments.\n\nAll installations are managed by registered Licensed Building Practitioners (LBP) under the supervision of Marcus Kuhtze (BP134821), ensuring complete compliance with NZBC E2/AS1, MRM Code of Practice, and local council Producer Statement PS3 requirements.`;
    } else {
      return `Please find enclosed our formal trade subcontract quotation for the metal roofing package at ${quote.siteAddress || 'the site'}.\n\nOur fixed-price sum of $${(quote.totalNZD || 0).toLocaleString()} (incl. GST) covers full material supply, workshop-fabricated perimeter flashings, site HIAB logistics, WorkSafe-compliant site execution, and certified trade installation. All progress claims are administered strictly in accordance with the NZ Construction Contracts Act 2002 (CCA).\n\nSite Safety Plans (SSSP), JSA hazard registers, and Licensed Building Practitioner (LBP) Producer Statement PS3 documentation will be supplied upon substantial completion.`;
    }
  };

  try {
    const res = await fetch('/api/ai/proposal-cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote, clientType, tone })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.coverLetter) {
        return data.coverLetter;
      }
    }
    return getFallbackLetter();
  } catch (err) {
    console.warn('Server proposal cover letter fetch fallback utilized:', err);
    return getFallbackLetter();
  }
}

export async function parseArchitectBriefAI(briefText: string): Promise<Partial<SmartTakeoffInput>> {
  const isReRoof = /reroof|re-roof|strip|decramastic|concrete tile|old iron|replace roof|tile to metal/i.test(briefText);
  let existingRoofType: ExistingRoofType = 'None (New Build)';
  if (/decramastic|metal tile/i.test(briefText)) existingRoofType = 'Decramastic / Metal Tile';
  else if (/concrete tile|clay tile/i.test(briefText)) existingRoofType = 'Concrete / Clay Tile';
  else if (/asbestos|super six/i.test(briefText)) existingRoofType = 'Asbestos Super Six / Shingles';
  else if (/iron|corrugate/i.test(briefText) && isReRoof) existingRoofType = 'Corrugated Iron';

  const isCorrugate = /corrugate|custom orb/i.test(briefText);
  const isTrapezoidal = /plumbdeck|trapezoidal|five rib|5-rib|trimform/i.test(briefText);
  let profile: RoofingProfile = 'Archtech Super Seam 38mm';
  if (isCorrugate) profile = 'TRS Corrugate 0.55mm';
  else if (isTrapezoidal) profile = 'TRS Plumbdeck Trapezoidal 0.55mm';
  else if (/snaplock/i.test(briefText)) profile = 'Archtech Snaplock 25mm';

  const getHeuristicTakeoff = (): Partial<SmartTakeoffInput> => {
    const areaMatch = briefText.match(/(\d{2,4})\s*(m2|sqm|m²)/i);
    const pitchMatch = briefText.match(/(\d{1,2})\s*(deg|degree|°)/i);
    const isCoastal = /coastal|beach|marine|surf|waterfront/i.test(briefText);

    return {
      category: isReRoof ? 'Residential Re-Roof' : 'Architectural Bespoke',
      existingRoofType,
      roofAreaM2: areaMatch ? parseInt(areaMatch[1], 10) : (isReRoof ? 180 : 240),
      pitchDegrees: pitchMatch ? parseInt(pitchMatch[1], 10) : (isCorrugate ? 12 : 4),
      windZone: isCoastal ? 'Extra High' : 'Very High',
      exposureZone: isCoastal ? 'Zone D (Severe Marine)' : 'Zone C (Medium)',
      preferredProfile: profile,
      preferredMaterial: isCoastal ? 'The Roofing Store MagnaFlow®' : 'Kiwicolour® Vitor+ PVDF (The Roofing Store)'
    };
  };

  try {
    const res = await fetch('/api/ai/parse-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ briefText })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        return {
          ...getHeuristicTakeoff(),
          ...data
        };
      }
    }
    return getHeuristicTakeoff();
  } catch (err) {
    console.warn('Server parse brief fetch fallback utilized:', err);
    return getHeuristicTakeoff();
  }
}
