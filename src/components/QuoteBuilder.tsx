import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Quote, 
  SpreadsheetSection, 
  SpreadsheetRow, 
  Lead, 
  MasterPricingCatalogue,
  RoofingProfile,
  CoilMaterial,
  Project,
  FlashingGirthTier,
  FlashingType
} from '../types/crm';
import { formatNZD, formatNZDWithDecimals, calculateGST, formatDate } from '../utils/formatters';
import { evaluateFormula, exportToCSV, copyTableForExcel } from '../utils/excelExporter';
import { OneDriveSyncModal } from './OneDriveSyncModal';
import { 
  Plus, 
  Trash2, 
  Eye, 
  Printer, 
  ShieldCheck, 
  X, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  FileSpreadsheet, 
  Calculator, 
  Download, 
  Copy, 
  Cloud, 
  ExternalLink, 
  Sparkles, 
  Percent, 
  Sliders, 
  FileText, 
  Settings2, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  FolderSync, 
  HelpCircle,
  Building,
  UserCheck,
  Search,
  UploadCloud,
  FileUp,
  Table,
  ArrowDownToLine,
  Compass,
  Ruler,
  Droplets,
  HardHat,
  GitCompare,
  Send,
  Lock,
  Clock,
  CheckCircle,
  Palette,
  LayoutTemplate,
  FileCheck,
  ListChecks
} from 'lucide-react';
import { ArchtechLogo } from './ArchtechLogo';
import { ArchitecturalSvgDiagram } from './ArchitecturalSvgDiagram';
import { 
  createNewQuoteVersion, 
  recalculateQuoteWithMatrix, 
  switchQuoteMaterialAndProfile, 
  canApplyPriceMatrix, 
  isQuoteExpired, 
  getEffectiveQuoteStatus, 
  getDaysUntilExpiry 
} from '../utils/quoteVersioning';
import { 
  MODULAR_COIL_MATERIALS, 
  MODULAR_TRAY_PROFILES, 
  MODULAR_FLASHING_TYPES, 
  MODULAR_RAINWATER_PRODUCTS,
  PAN_SIZE_BANDS,
  calculateDynamicTrayRate, 
  calculateDynamicFlashingRate, 
  calculateDynamicRainwaterRate,
  regenerateQuoteVersionWithMatrix,
  compareQuoteVersions,
  getStoredPricingMatrix
} from '../utils/pricingMatrix';
import { 
  runCodeComplianceAudit, 
  generateSmartScopeOfWorks, 
  QuoteAuditResult, 
  ComplianceIssue 
} from '../utils/smartRoofingEngine';
import { SmartTakeoffModal } from './SmartTakeoffModal';
import { SmartComplianceAuditorDrawer } from './SmartComplianceAuditorDrawer';
import { SmartProposalAIPolisherModal } from './SmartProposalAIPolisherModal';
import { ProposalPreview } from './ProposalPreview';
import { ExactRoofingHub } from './exactroofing/ExactRoofingHub';
import { RoofBomSummary, ExactRoofModelSnapshot } from '../types/exactRoofing';
import { applyBomToQuoteObject } from '../utils/exactRoofingBomBridge';

interface Props {
  quotes: Quote[];
  leads: Lead[];
  projects?: Project[];
  catalogue: MasterPricingCatalogue;
  onUpdateQuote: (quote: Quote) => void;
  onAddQuote: (quote: Quote) => void;
  onUpdateProject?: (project: Project) => void;
  prefillLead?: Lead | null;
  onNavigateToCatalogue?: () => void;
  onOpenClientPortalQuote?: (quoteId: string, projectId?: string) => void;
}

export const QuoteBuilder: React.FC<Props> = ({
  quotes,
  leads,
  projects = [],
  catalogue,
  onUpdateQuote,
  onAddQuote,
  onUpdateProject,
  prefillLead,
  onNavigateToCatalogue,
  onOpenClientPortalQuote
}) => {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(quotes[0]?.id || '');
  const activeQuote = quotes.find(q => q.id === selectedQuoteId) || quotes[0];

  // Primary View Mode: Excel Spreadsheet Estimator vs Client Interactive Proposal Portal
  const [viewMode, setViewMode] = useState<'spreadsheet' | 'client_portal'>('spreadsheet');

  // OneDrive modal state
  const [isOneDriveModalOpen, setIsOneDriveModalOpen] = useState(false);

  // Excel Paste Modal
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');

  // Column visibility toggles for Excel mode (Clean progressive disclosure)
  const [showCostColumns, setShowCostColumns] = useState(false);
  const [showWastageColumn, setShowWastageColumn] = useState(false);
  const [showFormulaColumn, setShowFormulaColumn] = useState(false);
  const [showSupplierColumn, setShowSupplierColumn] = useState(false);
  const [isQuoteActionsOpen, setIsQuoteActionsOpen] = useState(false);

  // Active cell in formula bar
  const [selectedCellInfo, setSelectedCellInfo] = useState<{ rowId: string; colKey: string; cellLabel: string; value: string }>({
    rowId: '',
    colKey: '',
    cellLabel: 'A1',
    value: ''
  });

  // Client Portal State
  const [clientSignerName, setClientSignerName] = useState('');
  const [clientAgreedTerms, setClientAgreedTerms] = useState(false);
  const [isSignedSuccess, setIsSignedSuccess] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  // Versioning & Master Matrix Pricing State
  const [isNewVersionModalOpen, setIsNewVersionModalOpen] = useState(false);
  const [versionReason, setVersionReason] = useState('');
  const [isSwitchSpecModalOpen, setIsSwitchSpecModalOpen] = useState(false);
  const [switchProfile, setSwitchProfile] = useState<RoofingProfile>(activeQuote.profile || 'Archtech Super Seam 38mm');
  const [switchMaterial, setSwitchMaterial] = useState<CoilMaterial>(activeQuote.material || 'The Roofing Store MagnaFlow®');
  const [switchPanSizeMm, setSwitchPanSizeMm] = useState<number>((activeQuote as any).panWidthMm || 450);
  const [matrixToast, setMatrixToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Version Comparison & Approval Modals
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [compareTargetQuoteId, setCompareTargetQuoteId] = useState<string>('');
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [signerNameInput, setSignerNameInput] = useState(activeQuote.clientName || '');
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [declineReasonInput, setDeclineReasonInput] = useState('');

  // Dynamic Matrix Item Calculator Modal State
  const [isDynamicMatrixItemModalOpen, setIsDynamicMatrixItemModalOpen] = useState(false);
  const [matrixItemCategory, setMatrixItemCategory] = useState<'tray' | 'flashing'>('tray');
  const [dynTrayProfile, setDynTrayProfile] = useState<RoofingProfile>('Archtech Super Seam 38mm');
  const [dynTrayMaterial, setDynTrayMaterial] = useState<CoilMaterial>('The Roofing Store MagnaFlow®');
  const [dynTrayPanSizeMm, setDynTrayPanSizeMm] = useState<number>(450);
  const [dynTrayQty, setDynTrayQty] = useState<number>(180);
  const [dynTrayUnit, setDynTrayUnit] = useState<'lm' | 'm2'>('lm');
  const [dynTrayMarkup, setDynTrayMarkup] = useState<number>(22);

  const [dynFlashingType, setDynFlashingType] = useState<FlashingType>('Ridge Cap Vent');
  const [dynFlashingMaterial, setDynFlashingMaterial] = useState<CoilMaterial>('The Roofing Store MagnaFlow®');
  const [dynFlashingGirthTier, setDynFlashingGirthTier] = useState<FlashingGirthTier>('301-450mm');
  const [dynFlashingQty, setDynFlashingQty] = useState<number>(36);
  const [dynFlashingMarkup, setDynFlashingMarkup] = useState<number>(25);

  // Smart Engine & AI Modals State
  const [isSmartTakeoffModalOpen, setIsSmartTakeoffModalOpen] = useState(false);
  const [isComplianceAuditorOpen, setIsComplianceAuditorOpen] = useState(false);
  const [isAIPolisherOpen, setIsAIPolisherOpen] = useState(false);
  const [isApexStudioModalOpen, setIsApexStudioModalOpen] = useState(false);

  // Live real-time NZBC E2/AS1 Compliance Audit
  const liveAuditResult = useMemo(() => {
    return runCodeComplianceAudit(activeQuote);
  }, [activeQuote]);

  const showMatrixToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setMatrixToast({ text, type });
    setTimeout(() => setMatrixToast(null), 4500);
  };

  const handleApplySmartScope = (newSections: SpreadsheetSection[], newRows: SpreadsheetRow[], summary: string) => {
    const newSubtotal = newRows.reduce((acc, r) => acc + (r.totalNZD || 0), 0);
    const newCost = newRows.reduce((acc, r) => acc + ((r.unitCostNZD || 0) * (r.quantity || 0) * (1 + (r.wastagePercent || 0) / 100)), 0);
    const newGst = calculateGST(newSubtotal).gst;
    const newTotal = newSubtotal + newGst;

    const updated: Quote = {
      ...activeQuote,
      spreadsheetSections: newSections,
      spreadsheetRows: newRows,
      quoteSections: newSections,
      quoteRows: newRows,
      subtotalNZD: newSubtotal,
      costTotalNZD: newCost,
      gstNZD: newGst,
      totalNZD: newTotal,
      notes: summary
    };
    onUpdateQuote(updated);
    showMatrixToast(`Applied Smart Scope (${newSections.length} packages, ${newRows.length} items, total ${formatNZD(newTotal)})!`, 'success');
  };

  const handleApplyFixPatch = (patch: Partial<Quote>, successMessage: string) => {
    const updated = { ...activeQuote, ...patch };
    onUpdateQuote(updated);
    showMatrixToast(successMessage, 'success');
  };

  const handleApplyAllFixes = () => {
    let patched = { ...activeQuote };
    liveAuditResult.issues.forEach((issue: ComplianceIssue) => {
      if (issue.appliedFixPatch) {
        patched = { ...patched, ...issue.appliedFixPatch };
      }
    });
    if (!patched.validUntil && !patched.expiresAt) {
      patched.validUntil = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    }
    onUpdateQuote(patched);
    showMatrixToast('Applied all automated architectural compliance fixes!', 'success');
  };

  const handleCreateNewVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionReason.trim()) return;
    try {
      const { newQuote, updatedPreviousQuote } = createNewQuoteVersion(
        activeQuote,
        versionReason.trim(),
        'Marcus Kuhtze (Estimator)'
      );
      onUpdateQuote(updatedPreviousQuote);
      onAddQuote(newQuote);
      setSelectedQuoteId(newQuote.id);
      setIsNewVersionModalOpen(false);
      setVersionReason('');
      showMatrixToast(`Created Version ${newQuote.version}.0 (${newQuote.quoteNumber}). Previous version marked Superseded.`, 'success');
    } catch (err: any) {
      showMatrixToast(err.message || 'Failed to create new version.', 'error');
    }
  };

  const handleRecalculateCurrentMatrix = () => {
    if (!canApplyPriceMatrix(activeQuote)) {
      showMatrixToast('Price matrix updates can only be applied to open quotes (Sent/Viewed/Expired). Accepted quotes are legally locked.', 'error');
      return;
    }

    try {
      const { newQuote, updatedPreviousQuote } = recalculateQuoteWithMatrix(activeQuote, catalogue, 'Marcus Kuhtze (Estimator)');
      if (updatedPreviousQuote) {
        onUpdateQuote(updatedPreviousQuote);
        onAddQuote(newQuote);
        setSelectedQuoteId(newQuote.id);
        showMatrixToast(`Master price matrix refreshed (${catalogue.lastUpdatedDate}). Issued new dated Version ${newQuote.version}.0!`, 'success');
      } else {
        onUpdateQuote(newQuote);
        showMatrixToast(`Draft quote unit rates updated against Master Price Matrix (${catalogue.lastUpdatedDate}).`, 'success');
      }
    } catch (err: any) {
      showMatrixToast(err.message || 'Failed to recalculate with matrix.', 'error');
    }
  };

  const handleExecuteSwitchProfileMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canApplyPriceMatrix(activeQuote)) {
      showMatrixToast('Price matrix updates can only be applied to open quotes. Accepted quotes are legally locked.', 'error');
      return;
    }
    try {
      const reason = versionReason.trim() || `Specification changed to ${switchProfile} (${switchPanSizeMm}mm pan) in ${switchMaterial}. Quantities preserved, rates dynamically updated from matrix.`;
      const { newQuote, updatedPreviousQuote } = regenerateQuoteVersionWithMatrix({
        previousQuote: activeQuote,
        targetProfile: switchProfile,
        targetMaterial: switchMaterial,
        targetPanSizeMm: switchPanSizeMm,
        reason,
        actor: 'Marcus Kuhtze (Estimator)'
      });
      onUpdateQuote(updatedPreviousQuote);
      onAddQuote(newQuote);
      setSelectedQuoteId(newQuote.id);
      setIsSwitchSpecModalOpen(false);
      setVersionReason('');
      showMatrixToast(`Switched specification to ${switchProfile} & ${switchMaterial} (${switchPanSizeMm}mm pan). Generated Version ${newQuote.version}.0!`, 'success');
    } catch (err: any) {
      showMatrixToast(err.message || 'Failed to switch profile/material.', 'error');
    }
  };

  const handleAddDynamicMatrixItem = () => {
    if (matrixItemCategory === 'tray') {
      const calc = calculateDynamicTrayRate(dynTrayProfile, dynTrayMaterial, dynTrayPanSizeMm);
      const isM2 = dynTrayUnit === 'm2';
      const effectiveQty = isM2 ? Math.round(dynTrayQty * calc.linearFactor * 10) / 10 : dynTrayQty;
      const effectiveUnitRate = Math.round(calc.ratePerLm * (1 + dynTrayMarkup / 100) * 100) / 100;
      const total = Math.round(effectiveQty * effectiveUnitRate * 100) / 100;
      const targetSec = sections.find(s => s.id === 'sec-1') || sections[0];

      const newRow: SpreadsheetRow = {
        id: `dyn-tray-${Date.now()}`,
        sectionId: targetSec.id,
        itemCode: `TR-${dynTrayPanSizeMm}`,
        description: `${dynTrayProfile} (${dynTrayPanSizeMm}mm pan, ${dynTrayMaterial})`,
        category: 'Roofing Trays',
        quantity: effectiveQty,
        unit: 'lm',
        wastagePercent: 5,
        unitCostNZD: calc.ratePerLm,
        markupPercent: dynTrayMarkup,
        unitSellNZD: effectiveUnitRate,
        totalNZD: total,
        formula: `=${effectiveQty} * ${effectiveUnitRate}`,
        notes: `Dynamic Matrix item: Slit width ${calc.slitWidthMm}mm, forming $${calc.formingCostPerLm}/lm, linear factor ${calc.linearFactor} lm/m².`,
        supplier: 'The Roofing Store (Albany)'
      };

      syncQuoteSpreadsheet(sections, [...rows, newRow]);
      setIsDynamicMatrixItemModalOpen(false);
      showMatrixToast(`Added dynamic ${dynTrayProfile} (${dynTrayPanSizeMm}mm) to quote at $${effectiveUnitRate}/lm!`, 'success');
    } else {
      const calc = calculateDynamicFlashingRate(dynFlashingType, dynFlashingMaterial, dynFlashingGirthTier);
      const effectiveUnitRate = Math.round(calc.ratePerLm * (1 + dynFlashingMarkup / 100) * 100) / 100;
      const total = Math.round(dynFlashingQty * effectiveUnitRate * 100) / 100;
      const targetSec = sections.find(s => s.id === 'sec-2') || sections[1] || sections[0];

      const newRow: SpreadsheetRow = {
        id: `dyn-flash-${Date.now()}`,
        sectionId: targetSec.id,
        itemCode: `FL-${dynFlashingGirthTier.split('-')[0]}`,
        description: `${dynFlashingType} (${dynFlashingGirthTier}, ${dynFlashingMaterial})`,
        category: 'Flashings',
        quantity: dynFlashingQty,
        unit: 'lm',
        wastagePercent: 5,
        unitCostNZD: calc.ratePerLm,
        markupPercent: dynFlashingMarkup,
        unitSellNZD: effectiveUnitRate,
        totalNZD: total,
        formula: `=${dynFlashingQty} * ${effectiveUnitRate}`,
        notes: `Dynamic Matrix item: Girth tier ${dynFlashingGirthTier}.`,
        supplier: 'Archtech Workshop'
      };

      syncQuoteSpreadsheet(sections, [...rows, newRow]);
      setIsDynamicMatrixItemModalOpen(false);
      showMatrixToast(`Added dynamic ${dynFlashingType} (${dynFlashingGirthTier}) to quote at $${effectiveUnitRate}/lm!`, 'success');
    }
  };

  // Dynamic Matrix Variable Change Handler
  // Profile + Material + Pan Size -> Recalculates Tray Price automatically!
  // Type + Material + Girth Band -> Recalculates Flashing Price automatically!
  // Rainwater Product + Material -> Recalculates Rainwater Price automatically!
  const handleMatrixVariableChange = (
    rowId: string, 
    field: 'profile' | 'material' | 'panSizeMm' | 'flashingType' | 'girthTier' | 'rainwaterProfile', 
    value: any
  ) => {
    const updatedRows = rows.map(r => {
      if (r.id !== rowId) return r;

      const updatedRow = { ...r, [field]: value, isMatrixItem: true };
      const isTray = updatedRow.matrixType === 'tray' || updatedRow.category === 'Roofing Trays' || updatedRow.category === 'Wall Cladding' || field === 'profile' || field === 'panSizeMm';
      const isFlashing = updatedRow.matrixType === 'flashing' || updatedRow.category === 'Flashings' || field === 'flashingType' || field === 'girthTier';
      const isRainwater = updatedRow.matrixType === 'rainwater' || updatedRow.category === 'Rainwater Goods' || field === 'rainwaterProfile';

      if (isTray) {
        const prof = (field === 'profile' ? value : (updatedRow.profile || activeQuote.profile || 'Archtech Super Seam 38mm')) as RoofingProfile;
        const mat = (field === 'material' ? value : (updatedRow.material || activeQuote.material || 'The Roofing Store MagnaFlow®')) as CoilMaterial;
        const pan = Number(field === 'panSizeMm' ? value : (updatedRow.panSizeMm || (activeQuote as any).panWidthMm || 450));
        
        const calc = calculateDynamicTrayRate(prof, mat, pan);
        const markup = updatedRow.markupPercent || activeQuote.markupPercent || 25;
        const unitSell = Math.round(calc.ratePerLm * (1 + markup / 100) * 100) / 100;
        const qty = Number(updatedRow.quantity) || 0;
        const total = Math.round(qty * unitSell * 100) / 100;

        return {
          ...updatedRow,
          matrixType: 'tray' as const,
          profile: prof,
          material: mat,
          panSizeMm: pan,
          unitCostNZD: calc.ratePerLm,
          unitSellNZD: unitSell,
          totalNZD: total,
          formula: `=${qty} * ${unitSell}`,
          description: `${prof} (${pan}mm pan, ${mat})`
        };
      }

      if (isFlashing) {
        const fType = (field === 'flashingType' ? value : (updatedRow.flashingType || 'Ridge Cap Vent')) as FlashingType;
        const mat = (field === 'material' ? value : (updatedRow.material || activeQuote.material || 'The Roofing Store MagnaFlow®')) as CoilMaterial;
        const gTier = (field === 'girthTier' ? value : (updatedRow.girthTier || '301-450mm')) as FlashingGirthTier;

        const calc = calculateDynamicFlashingRate(fType, mat, gTier, updatedRow.foldsCount || 3);
        const markup = updatedRow.markupPercent || activeQuote.markupPercent || 25;
        const unitSell = Math.round(calc.ratePerLm * (1 + markup / 100) * 100) / 100;
        const qty = Number(updatedRow.quantity) || 0;
        const total = Math.round(qty * unitSell * 100) / 100;

        return {
          ...updatedRow,
          matrixType: 'flashing' as const,
          flashingType: fType,
          material: mat,
          girthTier: gTier,
          unitCostNZD: calc.ratePerLm,
          unitSellNZD: unitSell,
          totalNZD: total,
          formula: `=${qty} * ${unitSell}`,
          description: `${fType} (${gTier}, ${mat})`
        };
      }

      if (isRainwater) {
        const prodName = field === 'rainwaterProfile' ? value : (updatedRow.rainwaterProfile || updatedRow.description);
        const mat = (field === 'material' ? value : (updatedRow.material || activeQuote.material || 'Kiwicolour® Vitor+ PVDF (The Roofing Store)')) as CoilMaterial;
        const calc = calculateDynamicRainwaterRate(prodName, mat);
        const markup = updatedRow.markupPercent || activeQuote.markupPercent || 25;
        const unitSell = Math.round(calc.ratePerUnit * (1 + markup / 100) * 100) / 100;
        const qty = Number(updatedRow.quantity) || 0;
        const total = Math.round(qty * unitSell * 100) / 100;

        return {
          ...updatedRow,
          matrixType: 'rainwater' as const,
          material: mat,
          rainwaterProfile: calc.product.name,
          itemCode: calc.product.code,
          unit: calc.product.unit,
          unitCostNZD: calc.ratePerUnit,
          unitSellNZD: unitSell,
          totalNZD: total,
          formula: `=${qty} * ${unitSell}`,
          description: `${calc.product.name} (${mat})`
        };
      }

      return updatedRow;
    });

    syncQuoteSpreadsheet(sections, updatedRows);
  };

  // Section-Level Universal Spec & Scope Area Handlers
  const handleSectionFieldChange = (sectionId: string, field: keyof SpreadsheetSection, value: any) => {
    const updatedSections = sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      return { ...sec, [field]: value };
    });
    syncQuoteSpreadsheet(updatedSections, rows);
  };

  // Universal Section Material Cascade (populates all rows in section, while leaving manual override option)
  const handleSectionMaterialChange = (sectionId: string, newMaterial: CoilMaterial) => {
    const updatedSections = sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      return { ...sec, defaultMaterial: newMaterial };
    });

    const updatedRows = rows.map(r => {
      if (r.sectionId !== sectionId) return r;

      if (r.matrixType === 'tray' || r.category === 'Roofing Trays' || r.category === 'Wall Cladding') {
        const prof = r.profile || 'Archtech Super Seam 38mm';
        const pan = r.panSizeMm || 450;
        const calc = calculateDynamicTrayRate(prof, newMaterial, pan);
        const markup = r.markupPercent || activeQuote.markupPercent || 25;
        const unitSell = Math.round(calc.ratePerLm * (1 + markup / 100) * 100) / 100;
        const qty = Number(r.quantity) || 0;
        return {
          ...r,
          material: newMaterial,
          unitCostNZD: calc.ratePerLm,
          unitSellNZD: unitSell,
          totalNZD: Math.round(qty * unitSell * 100) / 100,
          formula: `=${qty} * ${unitSell}`,
          description: `${prof} (${pan}mm pan, ${newMaterial})`
        };
      }

      if (r.matrixType === 'flashing' || r.category === 'Flashings') {
        const fType = r.flashingType || 'Ridge Cap Vent';
        const gTier = r.girthTier || '301-450mm';
        const calc = calculateDynamicFlashingRate(fType, newMaterial, gTier, r.foldsCount || 3);
        const markup = r.markupPercent || activeQuote.markupPercent || 25;
        const unitSell = Math.round(calc.ratePerLm * (1 + markup / 100) * 100) / 100;
        const qty = Number(r.quantity) || 0;
        return {
          ...r,
          material: newMaterial,
          unitCostNZD: calc.ratePerLm,
          unitSellNZD: unitSell,
          totalNZD: Math.round(qty * unitSell * 100) / 100,
          formula: `=${qty} * ${unitSell}`,
          description: `${fType} (${gTier}, ${newMaterial})`
        };
      }

      if (r.matrixType === 'rainwater' || r.category === 'Rainwater Goods') {
        const calc = calculateDynamicRainwaterRate(r.rainwaterProfile || r.itemCode || r.description, newMaterial);
        const markup = r.markupPercent || activeQuote.markupPercent || 25;
        const unitSell = Math.round(calc.ratePerUnit * (1 + markup / 100) * 100) / 100;
        const qty = Number(r.quantity) || 0;
        return {
          ...r,
          material: newMaterial,
          unitCostNZD: calc.ratePerUnit,
          unitSellNZD: unitSell,
          totalNZD: Math.round(qty * unitSell * 100) / 100,
          formula: `=${qty} * ${unitSell}`,
          description: `${calc.product.name} (${newMaterial})`
        };
      }

      return r;
    });

    syncQuoteSpreadsheet(updatedSections, updatedRows);
    showMatrixToast(`Universal section material set to ${newMaterial.replace(/\s*\(.*?\)/g, '')} — populated across section items!`, 'info');
  };

  // Universal Section Profile Cascade
  const handleSectionProfileChange = (sectionId: string, newProfile: RoofingProfile) => {
    const targetSec = sections.find(s => s.id === sectionId);
    const updatedSections = sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      return { ...sec, defaultProfile: newProfile };
    });

    const curMat = targetSec?.defaultMaterial || activeQuote.material || 'The Roofing Store MagnaFlow®';
    const updatedRows = rows.map(r => {
      if (r.sectionId !== sectionId) return r;
      if (r.matrixType === 'tray' || r.category === 'Roofing Trays' || r.category === 'Wall Cladding') {
        const pan = r.panSizeMm || targetSec?.defaultPanSizeMm || 450;
        const mat = r.material || curMat;
        const calc = calculateDynamicTrayRate(newProfile, mat, pan);
        const markup = r.markupPercent || activeQuote.markupPercent || 25;
        const unitSell = Math.round(calc.ratePerLm * (1 + markup / 100) * 100) / 100;
        const qty = Number(r.quantity) || 0;
        return {
          ...r,
          profile: newProfile,
          unitCostNZD: calc.ratePerLm,
          unitSellNZD: unitSell,
          totalNZD: Math.round(qty * unitSell * 100) / 100,
          formula: `=${qty} * ${unitSell}`,
          description: `${newProfile} (${pan}mm pan, ${mat})`
        };
      }
      return r;
    });

    syncQuoteSpreadsheet(updatedSections, updatedRows);
    showMatrixToast(`Section profile set to ${newProfile}!`, 'info');
  };

  // Universal Section Pan Size Cascade
  const handleSectionPanSizeChange = (sectionId: string, newPanSizeMm: number) => {
    const targetSec = sections.find(s => s.id === sectionId);
    const updatedSections = sections.map(sec => {
      if (sec.id !== sectionId) return sec;
      return { ...sec, defaultPanSizeMm: newPanSizeMm };
    });

    const curMat = targetSec?.defaultMaterial || activeQuote.material || 'The Roofing Store MagnaFlow®';
    const updatedRows = rows.map(r => {
      if (r.sectionId !== sectionId) return r;
      if (r.matrixType === 'tray' || r.category === 'Roofing Trays' || r.category === 'Wall Cladding') {
        const prof = r.profile || targetSec?.defaultProfile || 'Archtech Super Seam 38mm';
        const mat = r.material || curMat;
        const calc = calculateDynamicTrayRate(prof, mat, newPanSizeMm);
        const markup = r.markupPercent || activeQuote.markupPercent || 25;
        const unitSell = Math.round(calc.ratePerLm * (1 + markup / 100) * 100) / 100;
        const qty = Number(r.quantity) || 0;
        return {
          ...r,
          panSizeMm: newPanSizeMm,
          unitCostNZD: calc.ratePerLm,
          unitSellNZD: unitSell,
          totalNZD: Math.round(qty * unitSell * 100) / 100,
          formula: `=${qty} * ${unitSell}`,
          description: `${prof} (${newPanSizeMm}mm pan, ${mat})`
        };
      }
      return r;
    });

    syncQuoteSpreadsheet(updatedSections, updatedRows);
    showMatrixToast(`Section pan width set to ${newPanSizeMm}mm!`, 'info');
  };

  // Auto-calculate required tray lineal metres from Section Total m²
  const handleCalculateTrayLmFromM2 = (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section || !section.totalM2 || section.totalM2 <= 0) {
      showMatrixToast('Please enter a Scope Area (m²) for this section first.', 'error');
      return;
    }

    const m2 = section.totalM2;
    const panMm = section.defaultPanSizeMm || 450;
    const wastePct = 5;
    const calculatedLm = Math.round((m2 * (1000 / panMm) * (1 + wastePct / 100)) * 10) / 10;

    const existingTrayIndex = rows.findIndex(r => r.sectionId === sectionId && (r.matrixType === 'tray' || r.category === 'Roofing Trays' || r.category === 'Wall Cladding'));
    if (existingTrayIndex >= 0) {
      const existing = rows[existingTrayIndex];
      const unitSell = existing.unitSellNZD || 34.50;
      const updatedRows = [...rows];
      updatedRows[existingTrayIndex] = {
        ...existing,
        quantity: calculatedLm,
        wastagePercent: wastePct,
        totalNZD: Math.round(calculatedLm * unitSell * 100) / 100,
        formula: `=${calculatedLm} * ${unitSell}`,
        notes: `Calculated from ${m2} m² scope area (${panMm}mm pan width + ${wastePct}% cutting waste).`
      };
      syncQuoteSpreadsheet(sections, updatedRows);
      showMatrixToast(`Updated tray quantity to ${calculatedLm} lm (derived from ${m2} m²)!`, 'success');
    } else {
      handleAddTrayLine(sectionId, calculatedLm);
    }
  };

  // Deliberate Add Line Item Methods (Scoped to specific sections)
  const handleAddTrayLine = (sectionId: string, customQty?: number) => {
    const targetSec = sections.find(s => s.id === sectionId) || sections[0];
    const prof = targetSec.defaultProfile || activeQuote.profile || 'Archtech Super Seam 38mm';
    const mat = targetSec.defaultMaterial || activeQuote.material || 'The Roofing Store MagnaFlow®';
    const pan = targetSec.defaultPanSizeMm || 450;
    const calc = calculateDynamicTrayRate(prof, mat, pan);
    const markup = activeQuote.markupPercent || 25;
    const unitSell = Math.round(calc.ratePerLm * (1 + markup / 100) * 100) / 100;
    const qty = customQty !== undefined ? customQty : (targetSec.totalM2 ? Math.round(targetSec.totalM2 * (1000 / pan) * 1.05 * 10) / 10 : 100);
    const total = Math.round(qty * unitSell * 100) / 100;

    const newRow: SpreadsheetRow = {
      id: `tray-${Date.now()}`,
      sectionId: targetSec.id,
      itemCode: `TR-${pan}`,
      description: `${prof} (${pan}mm pan, ${mat})`,
      category: targetSec.sectionType === 'wall_cladding' ? 'Wall Cladding' : 'Roofing Trays',
      quantity: qty,
      unit: 'lm',
      wastagePercent: 5,
      unitCostNZD: calc.ratePerLm,
      markupPercent: markup,
      unitSellNZD: unitSell,
      totalNZD: total,
      formula: `=${qty} * ${unitSell}`,
      notes: `Roll-formed ${prof} in ${mat}. Factor ${calc.linearFactor} lm/m².`,
      supplier: 'The Roofing Store Ltd',
      isMatrixItem: true,
      matrixType: 'tray',
      profile: prof,
      material: mat,
      panSizeMm: pan
    };

    syncQuoteSpreadsheet(sections, [...rows, newRow]);
    showMatrixToast(`Added ${prof} line (${qty} lm) to ${targetSec.title}!`);
  };

  const handleAddFlashingLine = (sectionId: string) => {
    const targetSec = sections.find(s => s.id === sectionId) || sections[1] || sections[0];
    const fType: FlashingType = targetSec.sectionType === 'wall_cladding' ? 'Window Head / Jamb Flashing' : 'Ridge Cap Vent';
    const mat = targetSec.defaultMaterial || activeQuote.material || 'The Roofing Store MagnaFlow®';
    const gTier: FlashingGirthTier = '301-450mm';
    const calc = calculateDynamicFlashingRate(fType, mat, gTier, 4);
    const markup = activeQuote.markupPercent || 25;
    const unitSell = Math.round(calc.ratePerLm * (1 + markup / 100) * 100) / 100;
    const qty = 24;
    const total = Math.round(qty * unitSell * 100) / 100;

    const newRow: SpreadsheetRow = {
      id: `flash-${Date.now()}`,
      sectionId: targetSec.id,
      itemCode: `FL-301`,
      description: `${fType} (${gTier}, ${mat})`,
      category: 'Flashings',
      quantity: qty,
      unit: 'lm',
      wastagePercent: 5,
      unitCostNZD: calc.ratePerLm,
      markupPercent: markup,
      unitSellNZD: unitSell,
      totalNZD: total,
      formula: `=${qty} * ${unitSell}`,
      notes: `Custom folded flashing in ${mat}. Girth tier ${gTier}.`,
      supplier: 'Archtech Workshop',
      isMatrixItem: true,
      matrixType: 'flashing',
      flashingType: fType,
      material: mat,
      girthTier: gTier,
      foldsCount: 4
    };

    syncQuoteSpreadsheet(sections, [...rows, newRow]);
    showMatrixToast(`Added ${fType} line to ${targetSec.title}!`);
  };

  const handleAddRainwaterLine = (sectionId: string, defaultCode: string = 'RW-SP-150HR') => {
    const targetSec = sections.find(s => s.id === sectionId) || sections[0];
    const mat = targetSec.defaultMaterial || activeQuote.material || 'Kiwicolour® Vitor+ PVDF (The Roofing Store)';
    const rwItem = MODULAR_RAINWATER_PRODUCTS.find(p => p.code === defaultCode) || MODULAR_RAINWATER_PRODUCTS[0];
    const calc = calculateDynamicRainwaterRate(rwItem.code, mat);
    const markup = activeQuote.markupPercent || 25;
    const unitSell = Math.round(calc.ratePerUnit * (1 + markup / 100) * 100) / 100;
    const qty = rwItem.unit === 'ea' ? 2 : 24;
    const total = Math.round(qty * unitSell * 100) / 100;

    const newRow: SpreadsheetRow = {
      id: `rw-${Date.now()}`,
      sectionId: targetSec.id,
      itemCode: rwItem.code,
      description: `${rwItem.name} (${mat})`,
      category: 'Rainwater Goods',
      quantity: qty,
      unit: rwItem.unit,
      wastagePercent: rwItem.unit === 'lm' ? 5 : 0,
      unitCostNZD: calc.ratePerUnit,
      markupPercent: markup,
      unitSellNZD: unitSell,
      totalNZD: total,
      formula: `=${qty} * ${unitSell}`,
      notes: rwItem.description,
      supplier: 'The Roofing Store Ltd',
      isMatrixItem: true,
      matrixType: 'rainwater',
      material: mat,
      rainwaterType: rwItem.category,
      rainwaterProfile: rwItem.name
    };

    syncQuoteSpreadsheet(sections, [...rows, newRow]);
    showMatrixToast(`Added ${rwItem.name} to Rainwater Package!`);
  };

  const handleAddAccessoryLine = (sectionId: string) => {
    const targetSec = sections.find(s => s.id === sectionId) || sections[0];
    const newRow: SpreadsheetRow = {
      id: `acc-${Date.now()}`,
      sectionId: targetSec.id,
      itemCode: 'TRS-CLIP-316S',
      description: 'Continuous 316 Stainless Steel Sliding Clips (The Roofing Store)',
      category: 'Clips & Fixings',
      quantity: 500,
      unit: 'ea',
      wastagePercent: 0,
      unitCostNZD: 0.85,
      markupPercent: 35.3,
      unitSellNZD: 1.15,
      totalNZD: 575.00,
      formula: '=500 * 1.15',
      notes: 'Marine grade 316 stainless sliding expansion clips for thermal movement.',
      supplier: 'The Roofing Store Ltd',
      isMatrixItem: false,
      matrixType: 'fixed'
    };

    syncQuoteSpreadsheet(sections, [...rows, newRow]);
    showMatrixToast(`Added fixing hardware item to ${targetSec.title}!`);
  };

  // Quoting Suite Workflow Actions
  const handleSaveDraft = () => {
    const updated: Quote = {
      ...activeQuote,
      status: activeQuote.status === 'sent' || activeQuote.status === 'accepted' ? activeQuote.status : 'draft'
    };
    onUpdateQuote(updated);
    showMatrixToast(`Quote draft saved successfully (${activeQuote.quoteNumber}).`);
  };

  const handleIssueAndSend = () => {
    const today = new Date().toISOString().split('T')[0];
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const token = activeQuote.clientToken || `token-${Date.now()}`;
    const url = `${window.location.origin}${window.location.pathname}?quoteId=${activeQuote.id}&token=${token}`;

    const updated: Quote = {
      ...activeQuote,
      status: 'sent',
      issueDate: activeQuote.issueDate || today,
      validUntil: activeQuote.validUntil || expiryDate,
      clientToken: token
    };
    onUpdateQuote(updated);

    navigator.clipboard?.writeText(url);
    showMatrixToast(`Quote issued and set to Sent! Secure client proposal link copied to clipboard.`, 'success');
  };

  const handleMarkAccepted = (signerName: string) => {
    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];
    const updated: Quote = {
      ...activeQuote,
      status: 'accepted',
      isLocked: true,
      signedAt: today,
      clientSignature: signerName,
      acceptedBy: {
        name: signerName,
        email: activeQuote.clientEmail || 'client@example.co.nz',
        timestamp: nowIso
      }
    };
    onUpdateQuote(updated);
    setIsAcceptModalOpen(false);
    showMatrixToast(`Quote ${activeQuote.quoteNumber} formally accepted & locked! Total: ${formatNZD(activeQuote.totalNZD)}.`, 'success');
  };

  const handleMarkDeclined = (reason: string) => {
    const updated: Quote = {
      ...activeQuote,
      status: 'declined',
      declinedReason: reason
    };
    onUpdateQuote(updated);
    setIsDeclineModalOpen(false);
    showMatrixToast(`Quote ${activeQuote.quoteNumber} marked as declined.`);
  };

  const handleCopyClientLink = () => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    const url = `${origin}${path}?quoteId=${activeQuote.id}&token=${activeQuote.clientToken || 'active'}`;
    navigator.clipboard?.writeText(url);
    showMatrixToast(`Copied secure client portal link (${activeQuote.quoteNumber}) to clipboard!`, 'info');
  };

  // Matching Project & Takeoff Import Modal State
  const matchingProject = projects.find(p =>
    (activeQuote.projectId && p.id === activeQuote.projectId) ||
    (p.clientName && activeQuote.clientName && p.clientName.toLowerCase() === activeQuote.clientName.toLowerCase()) ||
    (p.siteAddress && activeQuote.siteAddress && (
      p.siteAddress.toLowerCase().includes(activeQuote.siteAddress.toLowerCase()) ||
      activeQuote.siteAddress.toLowerCase().includes(p.siteAddress.toLowerCase())
    ))
  ) || projects[0];

  const [selectedTakeoffProjectId, setSelectedTakeoffProjectId] = useState<string>(matchingProject?.id || '');
  const [isTakeoffModalOpen, setIsTakeoffModalOpen] = useState(false);
  const [takeoffToast, setTakeoffToast] = useState<string | null>(null);

  const activeTakeoffProject = projects.find(p => p.id === selectedTakeoffProjectId) || matchingProject;

  const handlePushBomFromApex = (opts: {
    targetQuoteId: string | 'new';
    profile: RoofingProfile;
    material: CoilMaterial;
    colorName: string;
    markupPercent: number;
    includeHardware: boolean;
    includeUnderlay: boolean;
    includeLabourEstimate: boolean;
    replaceExistingSections: boolean;
    bom: RoofBomSummary;
    snapshot: ExactRoofModelSnapshot;
    project?: Project;
  }) => {
    const targetProject = opts.project || activeTakeoffProject || matchingProject;
    if (opts.targetQuoteId === 'new') {
      const baseNewQuote: Quote = {
        ...activeQuote,
        id: `q-${Date.now()}`,
        quoteNumber: `QT-${Math.floor(1000 + Math.random() * 9000)}`,
        projectId: targetProject?.id || activeQuote.projectId,
        clientName: targetProject?.clientName || activeQuote.clientName,
        siteAddress: targetProject?.siteAddress || activeQuote.siteAddress,
        profile: opts.profile,
        material: opts.material,
        colorName: opts.colorName,
        markupPercent: opts.markupPercent,
        status: 'draft',
        version: 1,
        createdAt: new Date().toISOString().split('T')[0],
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        spreadsheetSections: [],
        spreadsheetRows: [],
        quoteSections: [],
        quoteRows: []
      };
      const populated = applyBomToQuoteObject({
        quote: baseNewQuote,
        bom: opts.bom,
        snapshot: opts.snapshot,
        includeHardware: opts.includeHardware,
        includeUnderlay: opts.includeUnderlay,
        includeLabourEstimate: opts.includeLabourEstimate,
        replaceExistingSections: true
      });
      onAddQuote(populated);
      setSelectedQuoteId(populated.id);
      if (targetProject && onUpdateProject) {
        onUpdateProject({
          ...targetProject,
          roofPlanModel: opts.snapshot as any,
          roofAreaM2: opts.bom.totalRoofAreaM2 || targetProject.roofAreaM2
        });
      }
      setIsApexStudioModalOpen(false);
      showMatrixToast(`Created quote ${populated.quoteNumber} from ApexMap BOM (${formatNZD(populated.totalNZD || 0)} incl. GST).`, 'success');
    } else {
      const target = quotes.find(q => q.id === opts.targetQuoteId) || activeQuote;
      const updated = applyBomToQuoteObject({
        quote: {
          ...target,
          projectId: target.projectId || targetProject?.id,
          profile: opts.profile,
          material: opts.material,
          colorName: opts.colorName,
          markupPercent: opts.markupPercent
        },
        bom: opts.bom,
        snapshot: opts.snapshot,
        includeHardware: opts.includeHardware,
        includeUnderlay: opts.includeUnderlay,
        includeLabourEstimate: opts.includeLabourEstimate,
        replaceExistingSections: opts.replaceExistingSections
      });
      onUpdateQuote(updated);
      setSelectedQuoteId(updated.id);
      if (targetProject && onUpdateProject) {
        onUpdateProject({
          ...targetProject,
          roofPlanModel: opts.snapshot as any,
          roofAreaM2: opts.bom.totalRoofAreaM2 || targetProject.roofAreaM2
        });
      }
      setIsApexStudioModalOpen(false);
      showMatrixToast(`Imported ApexMap BOM into ${updated.quoteNumber} (${formatNZD(updated.totalNZD || 0)} incl. GST).`, 'success');
    }
  };

  const handleImportSavedRoofBom = () => {
    const savedModel = activeTakeoffProject?.roofPlanModel as ExactRoofModelSnapshot | undefined;
    if (!savedModel?.bom) return;
    const populated = applyBomToQuoteObject({
      quote: activeQuote,
      bom: savedModel.bom,
      snapshot: savedModel,
      includeHardware: true,
      includeUnderlay: true,
      includeLabourEstimate: true,
      replaceExistingSections: false
    });
    onUpdateQuote(populated);
    setIsTakeoffModalOpen(false);
    showMatrixToast(`Imported saved ApexMap Roof BOM (${savedModel.bom.totalRoofAreaM2} m², ${savedModel.bom.totalSheetsCount} sheets) into ${activeQuote.quoteNumber}.`, 'success');
  };

  // Holistic Architectural Proposal Presets & Standards
  const DEFAULT_SCOPE_INCLUSIONS: string[] = [
    'Precision continuous roll-forming of architectural standing seam trays manufactured to verified site lengths in specified 0.55mm coil substrate.',
    'Workshop custom fabrication of all matching perimeter, ridge vent, barge roll, apron, abutment, and penetration flashings per NZMRM specifications.',
    'Concealed marine-grade 316 stainless steel two-piece thermal expansion sliding clips allowing unrestricted expansion/contraction.',
    'High-performance synthetic micro-porous breathable roof underlay membrane with 150mm taped laps for secondary condensation control.',
    'Double-lock mechanical standing seam closing with calibrated trade tooling by qualified sheet metal craftsmen.',
    'Auckland Council / Territorial Authority Producer Statement PS3 documentation provided upon completion for Code Compliance Certificate (CCC).'
  ];

  const DEFAULT_SCOPE_EXCLUSIONS: string[] = [
    'Supply, installation, or structural framing remediation of CD plywood substrate, trusses, or timber purlins (by builder).',
    'Electrical or plumbing disconnection, reconnection, or certification (e.g. solar PV panels, HVAC, heat pumps, TV aerials).',
    'Territorial Authority Building Consent application, vetting, inspection, or council processing fees (by owner / architect).',
    'Scaffolding or edge protection above standard 2-storey scope unless separately scheduled in Preliminaries.',
    'Rectification of existing non-compliant roof framing pitch, drainage sumps, or framing falls below the 3° minimum requirement.'
  ];

  const DEFAULT_PAYMENT_MILESTONES = [
    { stage: '1. Deposit & Coil Allocation', percentage: 20, description: 'Secures coil slit reservation from The Roofing Store & confirms manufacturing slot' },
    { stage: '2. Site Delivery & Dry-in', percentage: 30, description: 'Trays delivered to site via specialized transport & underlay membrane installed' },
    { stage: '3. Tray Laying & Mechanical Seaming', percentage: 35, description: 'All pans laid, sliding clips fastened, seams double-locked, and flashings fitted' },
    { stage: '4. Final QA & Council PS3 Sign-off', percentage: 15, description: 'Producer Statement PS3 issued for Council CCC application upon snagging sign-off' }
  ];

  // Helper to extract clean, professional titles and holistic architectural metadata
  const getHolisticSectionPresentation = (section: SpreadsheetSection, sectionRows: SpreadsheetRow[]) => {
    // Strips robotic numbering like "1. ", "Section 2 - ", "#1 ", etc.
    const cleanTitle = section.title.replace(/^(\d+[\.\-\)]\s*|Section\s*\d+\s*[\:\-]\s*)/i, '').trim();

    let systemCategory = 'Architectural Scope Package';
    let systemKicker = 'Engineered Specification';
    let systemIcon = 'roof';
    let systemSummary = '';

    const lowerTitle = cleanTitle.toLowerCase();
    if (section.sectionType === 'roof' || lowerTitle.includes('roof')) {
      systemCategory = 'Roof Envelope System';
      systemKicker = 'Standing Seam Tray Fabrication & Weatherproofing';
      systemIcon = 'roof';
      systemSummary = `Supply and precision roll-forming of continuous standing seam trays to site-verified measures, installed over structural CD plywood with 316 stainless thermal sliding clips and full weathertightness laps.`;
    } else if (section.sectionType === 'wall_cladding' || lowerTitle.includes('wall') || lowerTitle.includes('cladding')) {
      systemCategory = 'Vertical Facade System';
      systemKicker = 'Interlocking Architectural Panels & Cavity Integration';
      systemIcon = 'cladding';
      systemSummary = `Architectural interlocking cassette panels fabricated with concealed fastener return hems, integrated into drained and vented timber batten cavities with matching head/jamb joinery flashings.`;
    } else if (section.sectionType === 'rainwater' || lowerTitle.includes('rainwater') || lowerTitle.includes('spouting') || lowerTitle.includes('downpipe')) {
      systemCategory = 'Rainwater & Drainage System';
      systemKicker = 'Continuous Spouting, Downpipes & Custom Rainheads';
      systemIcon = 'rainwater';
      systemSummary = `Seamless continuous high-capacity rainwater management engineered to prevent overflow into exterior wall cavities, fabricated from color-matched coil stock with heavy-duty structural brackets.`;
    } else if (section.sectionType === 'flashings' || lowerTitle.includes('flashing')) {
      systemCategory = 'Junction & Penetration Weatherproofing';
      systemKicker = 'Custom Workshop-Folded Perimeter Flashings';
      systemIcon = 'flashings';
      systemSummary = `All perimeter, ridge vent, barge roll, apron, abutment, and penetration flashings folded to custom site girths and angles in our workshop in strict accordance with NZBC E2/AS1 details.`;
    } else if (section.sectionType === 'underlay' || lowerTitle.includes('underlay')) {
      systemCategory = 'Vapour Barrier & Condensation Control';
      systemKicker = 'High-Performance Synthetic Breather Membrane';
      systemIcon = 'underlay';
      systemSummary = `Heavy-duty micro-porous synthetic roof underlay installed taut across substrate with 150mm taped laps, providing critical secondary weathertightness and condensation management.`;
    } else if (section.sectionType === 'hardware' || lowerTitle.includes('hardware') || lowerTitle.includes('clip')) {
      systemCategory = 'Concealed Fastening & Thermal Expansion';
      systemKicker = 'Marine Grade 316 Stainless Sliding Clips';
      systemIcon = 'hardware';
      systemSummary = `Concealed two-piece sliding cleat fixings engineered to allow unrestricted thermal expansion and contraction across tray lengths, preventing oil-canning and distortion.`;
    } else if (section.sectionType === 'labour' || lowerTitle.includes('labour') || lowerTitle.includes('seaming')) {
      systemCategory = 'Trade Craftsmanship & Quality Assurance';
      systemKicker = 'Specialist Seaming & LBP Site Supervision';
      systemIcon = 'labour';
      systemSummary = `Experienced trade installation by certified sheet metal craftsmen, including precision tray alignment, double-lock mechanical seaming, and formal Licensed Building Practitioner oversight.`;
    } else {
      systemCategory = 'Project Execution & Compliance';
      systemKicker = 'Site Logistics, Scaffolding & PS3 Sign-off';
      systemIcon = 'logistics';
      systemSummary = `Comprehensive site safety, delivery logistics, certified edge protection, and council Producer Statement PS3 documentation required for the final Code Compliance Certificate (CCC).`;
    }

    return { cleanTitle, systemCategory, systemKicker, systemIcon, systemSummary };
  };

  // Quote Presentation Controls & Proposal Customizer State
  const [proposalTemplate, setProposalTemplate] = useState<'architectural' | 'residential_reroof' | 'modern_minimal' | 'commercial_tender'>(
    (activeQuote.proposalTemplate as any) || 
    (activeQuote.category === 'Residential Re-Roof' || activeQuote.profile?.includes('Corrugate') ? 'residential_reroof' : 'architectural')
  );
  const [detailLevel, setDetailLevel] = useState<'holistic' | 'itemized_rates' | 'itemized_no_rates' | 'section_summary'>('holistic');
  const [hiddenSectionIds, setHiddenSectionIds] = useState<string[]>([]);
  const [showCoverLetter, setShowCoverLetter] = useState(true);
  const [isEditingCoverLetter, setIsEditingCoverLetter] = useState(false);
  const [coverLetterText, setCoverLetterText] = useState(
    activeQuote.proposalCoverLetter ||
    (activeQuote.category === 'Residential Re-Roof' || activeQuote.profile?.includes('Corrugate')
      ? `Thank you for inviting Archtech to provide a comprehensive re-roofing proposal for your home at ${activeQuote.siteAddress || 'your property'}.\n\nArchtech specializes in all profiled metal roofing — delivering turn-key strip-and-replace solutions with complete peace of mind. We carefully stage our work each day to ensure your home remains completely weather-tight throughout the project. Our team provides WorkSafe-certified perimeter edge protection, thorough structural purlin inspections, and daily magnetic sweeps of your grounds to keep your family and pets safe.\n\nYour new ${activeQuote.profile || 'profiled metal'} roof in ${activeQuote.material || 'prepainted steel'} is sourced directly from The Roofing Store, backed by up to 35-year manufacturer warranties and a 10-Year Archtech Workmanship Guarantee supervised by Licensed Building Practitioner Marcus Kuhtze (BP134821).`
      : `Thank you for the opportunity to present our comprehensive quotation for the profiled metal roofing package at ${activeQuote.siteAddress || 'the specified site'}.\n\nArchtech is an accredited specialist installer of all profiled metal roofing and custom-folded architectural flashings. All roll-forming and coil substrates are sourced directly from The Roofing Store (NZ), fabricated with Vitor+® and MagnaFlow® prepainted steel to withstand New Zealand's severe marine and high-wind environments.\n\nAll installations are managed by registered Licensed Building Practitioners (LBP) under the supervision of Marcus Kuhtze (BP134821), ensuring complete compliance with NZBC E2/AS1, MRM Code of Practice, and local council Producer Statement PS3 requirements.`)
  );
  const [showWarrantyBlock, setShowWarrantyBlock] = useState(true);
  const [showPaymentMilestones, setShowPaymentMilestones] = useState(true);
  const [showTechnicalSpecs, setShowTechnicalSpecs] = useState(true);
  const [showDiagram, setShowDiagram] = useState(true);
  const [showMetricsBanner, setShowMetricsBanner] = useState(true);
  const [showInclusionsExclusions, setShowInclusionsExclusions] = useState(true);
  const [showPresentationControls, setShowPresentationControls] = useState(false);
  const [isCustomizerModalOpen, setIsCustomizerModalOpen] = useState(false);
  const [customizerActiveTab, setCustomizerActiveTab] = useState<'template' | 'letter' | 'inclusions' | 'milestones' | 'sections'>('template');

  // Editable Inclusions, Exclusions & Milestones State
  const [scopeInclusions, setScopeInclusions] = useState<string[]>(activeQuote.proposalInclusions || DEFAULT_SCOPE_INCLUSIONS);
  const [scopeExclusions, setScopeExclusions] = useState<string[]>(activeQuote.proposalExclusions || DEFAULT_SCOPE_EXCLUSIONS);
  const [paymentMilestones, setPaymentMilestones] = useState(activeQuote.proposalPaymentMilestones || DEFAULT_PAYMENT_MILESTONES);
  const [newInclusionText, setNewInclusionText] = useState('');
  const [newExclusionText, setNewExclusionText] = useState('');

  // Customizer Inclusions & Exclusions Handlers
  const handleAddInclusion = () => {
    if (!newInclusionText.trim()) return;
    setScopeInclusions(prev => [...prev, newInclusionText.trim()]);
    setNewInclusionText('');
  };

  const handleRemoveInclusion = (index: number) => {
    setScopeInclusions(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddExclusion = () => {
    if (!newExclusionText.trim()) return;
    setScopeExclusions(prev => [...prev, newExclusionText.trim()]);
    setNewExclusionText('');
  };

  const handleRemoveExclusion = (index: number) => {
    setScopeExclusions(prev => prev.filter((_, i) => i !== index));
  };

  const handleResetInclusionsExclusions = () => {
    setScopeInclusions(DEFAULT_SCOPE_INCLUSIONS);
    setScopeExclusions(DEFAULT_SCOPE_EXCLUSIONS);
    setPaymentMilestones(DEFAULT_PAYMENT_MILESTONES);
    showMatrixToast('Scope inclusions and exclusions reset to standard architectural defaults.', 'info');
  };

  const handleSaveProposalPreferences = () => {
    if (onUpdateQuote) {
      onUpdateQuote({
        ...activeQuote,
        proposalTemplate,
        proposalDetailLevel: detailLevel,
        proposalInclusions: scopeInclusions,
        proposalExclusions: scopeExclusions,
        proposalCoverLetter: coverLetterText,
        proposalPaymentMilestones: paymentMilestones
      });
    }
    setIsCustomizerModalOpen(false);
    showMatrixToast('Proposal template and scope customization preferences saved!', 'success');
  };

  // Copy of spreadsheet sections & rows for the active quote
  const defaultSections: SpreadsheetSection[] = [
    { 
      id: 'sec-1', 
      title: '1. Architectural Standing Seam Roofing Package', 
      colorTag: 'border-l-sky-500',
      sectionType: 'roof',
      totalM2: 285,
      defaultProfile: 'Archtech Super Seam 38mm',
      defaultMaterial: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
      defaultPanSizeMm: 450
    },
    { 
      id: 'sec-2', 
      title: '2. Architectural Wall Cladding Package', 
      colorTag: 'border-l-teal-500',
      sectionType: 'wall_cladding',
      totalM2: 140,
      defaultProfile: 'Archtech Interlocking Panels',
      defaultMaterial: 'The Roofing Store MagnaFlow®',
      defaultPanSizeMm: 300
    },
    { 
      id: 'sec-3', 
      title: '3. Custom Folded Architectural Flashings (Girth Matrix)', 
      colorTag: 'border-l-amber-500',
      sectionType: 'flashings',
      defaultMaterial: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)'
    },
    { 
      id: 'sec-4', 
      title: '4. Continuous Rainwater System (Spouting, Downpipes & Rainheads)', 
      colorTag: 'border-l-cyan-600',
      sectionType: 'rainwater',
      defaultMaterial: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)'
    },
    { 
      id: 'sec-5', 
      title: '5. Fixing Hardware, Thermal Slide Clips & Screws', 
      colorTag: 'border-l-purple-500',
      sectionType: 'hardware'
    },
    { 
      id: 'sec-6', 
      title: '6. Synthetic Breather Underlay & Vapour Control', 
      colorTag: 'border-l-indigo-500',
      sectionType: 'underlay',
      totalM2: 425
    },
    { 
      id: 'sec-7', 
      title: '7. Architectural Labour & Mechanical Seaming', 
      colorTag: 'border-l-emerald-600',
      sectionType: 'labour'
    },
    { 
      id: 'sec-8', 
      title: '8. Delivery, Scaffolding, PS3 Compliance & CCC Sign-off', 
      colorTag: 'border-l-slate-600',
      sectionType: 'custom'
    }
  ];

  const defaultRows: SpreadsheetRow[] = [
    // Section 1: Roll-formed Roofing Trays
    {
      id: 'row-1',
      sectionId: 'sec-1',
      itemCode: 'SS-38-FLAX',
      description: 'Archtech Super Seam 38mm Tray Pans (450mm pan, Kiwicolour® Vitor+ PVDF)',
      category: 'Roofing Trays',
      quantity: 633.3,
      unit: 'lm',
      wastagePercent: 5,
      unitCostNZD: 28.50,
      markupPercent: 21,
      unitSellNZD: 34.50,
      totalNZD: 21848.85,
      formula: '=633.3 * 34.50',
      notes: 'Main Gable Roof. Continuous roll-formed pans up to 14.2m with thermal slide clips.',
      supplier: 'The Roofing Store (Albany)',
      isMatrixItem: true,
      matrixType: 'tray',
      profile: 'Archtech Super Seam 38mm',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
      panSizeMm: 450
    },
    // Section 2: Architectural Wall Cladding
    {
      id: 'row-2',
      sectionId: 'sec-2',
      itemCode: 'IP-300-MAGNA',
      description: 'Archtech Interlocking Panels (300mm pan, The Roofing Store MagnaFlow®)',
      category: 'Wall Cladding',
      quantity: 266.7,
      unit: 'lm',
      wastagePercent: 8,
      unitCostNZD: 29.80,
      markupPercent: 22.5,
      unitSellNZD: 36.50,
      totalNZD: 9734.55,
      formula: '=266.7 * 36.50',
      notes: 'North & West Coastal Elevation. 25mm shadow reveal joint.',
      supplier: 'The Roofing Store (Albany)',
      isMatrixItem: true,
      matrixType: 'tray',
      profile: 'Archtech Interlocking Panels',
      material: 'The Roofing Store MagnaFlow®',
      panSizeMm: 300
    },
    // Section 3: Flashings
    {
      id: 'row-3',
      sectionId: 'sec-3',
      itemCode: 'FL-RIDGE-300',
      description: 'Ridge Cap Vent (301-450mm, Kiwicolour® Vitor+ PVDF)',
      category: 'Flashings',
      quantity: 34,
      unit: 'lm',
      wastagePercent: 5,
      unitCostNZD: 31.00,
      markupPercent: 25.8,
      unitSellNZD: 39.00,
      totalNZD: 1326.00,
      formula: '=34 * 39.00',
      notes: 'Baffled ridge with breathable mesh insert.',
      supplier: 'Archtech Workshop',
      isMatrixItem: true,
      matrixType: 'flashing',
      flashingType: 'Ridge Cap Vent',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
      girthTier: '301-450mm',
      foldsCount: 4
    },
    {
      id: 'row-4',
      sectionId: 'sec-3',
      itemCode: 'FL-BARGE-150',
      description: 'Barge Flashing / Roll (151-300mm, Kiwicolour® Vitor+ PVDF)',
      category: 'Flashings',
      quantity: 48,
      unit: 'lm',
      wastagePercent: 5,
      unitCostNZD: 24.50,
      markupPercent: 28.5,
      unitSellNZD: 31.50,
      totalNZD: 1512.00,
      formula: '=48 * 31.50',
      notes: 'Hemmed onto continuous hooked cleat.',
      supplier: 'Archtech Workshop',
      isMatrixItem: true,
      matrixType: 'flashing',
      flashingType: 'Barge Flashing / Roll',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
      girthTier: '151-300mm',
      foldsCount: 3
    },
    {
      id: 'row-5',
      sectionId: 'sec-3',
      itemCode: 'FL-APRON-300',
      description: 'Apron / Abutment Flashing (301-450mm, Kiwicolour® Vitor+ PVDF)',
      category: 'Flashings',
      quantity: 22,
      unit: 'lm',
      wastagePercent: 5,
      unitCostNZD: 29.00,
      markupPercent: 24.1,
      unitSellNZD: 36.00,
      totalNZD: 792.00,
      formula: '=22 * 36.00',
      notes: 'Chased into weatherboard reglet.',
      supplier: 'Archtech Workshop',
      isMatrixItem: true,
      matrixType: 'flashing',
      flashingType: 'Apron / Abutment Flashing',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
      girthTier: '301-450mm',
      foldsCount: 3
    },
    // Section 4: Rainwater System & Spouting
    {
      id: 'row-rw-1',
      sectionId: 'sec-4',
      itemCode: 'RW-SP-150HR',
      description: '150mm European Half-Round Spouting (Kiwicolour® Vitor+ PVDF)',
      category: 'Rainwater Goods',
      quantity: 48,
      unit: 'lm',
      wastagePercent: 5,
      unitCostNZD: 34.00,
      markupPercent: 42.6,
      unitSellNZD: 48.50,
      totalNZD: 2328.00,
      formula: '=48 * 48.50',
      notes: 'Architectural European half-round eaves gutter with internal concealed brackets.',
      supplier: 'The Roofing Store Ltd',
      isMatrixItem: true,
      matrixType: 'rainwater',
      rainwaterType: 'spouting',
      rainwaterProfile: '150mm European Half-Round Spouting',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)'
    },
    {
      id: 'row-rw-2',
      sectionId: 'sec-4',
      itemCode: 'RW-BRK-500',
      description: 'Concealed Spouting Brackets (500mm centers)',
      category: 'Rainwater Goods',
      quantity: 96,
      unit: 'ea',
      wastagePercent: 0,
      unitCostNZD: 8.50,
      markupPercent: 47.1,
      unitSellNZD: 12.50,
      totalNZD: 1200.00,
      formula: '=96 * 12.50',
      notes: 'Heavy duty aluminium brackets fixed to rafter tails at 500mm centers.',
      supplier: 'The Roofing Store Ltd',
      isMatrixItem: false,
      matrixType: 'fixed'
    },
    {
      id: 'row-rw-3',
      sectionId: 'sec-4',
      itemCode: 'RW-DP-100R',
      description: '100mm Round Architectural Downpipe (Kiwicolour® Vitor+ PVDF)',
      category: 'Rainwater Goods',
      quantity: 28,
      unit: 'lm',
      wastagePercent: 5,
      unitCostNZD: 31.50,
      markupPercent: 39.7,
      unitSellNZD: 44.00,
      totalNZD: 1232.00,
      formula: '=28 * 44.00',
      notes: 'Seamless circular downpipe with swaged slip-joint sockets and matching standoff clips.',
      supplier: 'The Roofing Store Ltd',
      isMatrixItem: true,
      matrixType: 'rainwater',
      rainwaterType: 'downpipe',
      rainwaterProfile: '100mm Round Architectural Downpipe',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)'
    },
    {
      id: 'row-rw-4',
      sectionId: 'sec-4',
      itemCode: 'RW-RH-BOX',
      description: 'Architectural Box Rainhead (with Overflow Weir, Kiwicolour® Vitor+ PVDF)',
      category: 'Rainwater Goods',
      quantity: 2,
      unit: 'ea',
      wastagePercent: 0,
      unitCostNZD: 265.00,
      markupPercent: 45.3,
      unitSellNZD: 385.00,
      totalNZD: 770.00,
      formula: '=2 * 385.00',
      notes: 'Custom folded and welded architectural box collector with 100mm dropper outlet.',
      supplier: 'The Roofing Store Ltd',
      isMatrixItem: true,
      matrixType: 'rainwater',
      rainwaterType: 'rainhead',
      rainwaterProfile: 'Architectural Box Rainhead (with Overflow Weir)',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)'
    },
    // Section 5: Fixing Hardware & Clips
    {
      id: 'row-6',
      sectionId: 'sec-5',
      itemCode: 'CLIP-SS-SLIDE',
      description: 'TRS 316 Stainless Steel Sliding Thermal Movement Clips',
      category: 'Hardware',
      quantity: 1600,
      unit: 'ea',
      wastagePercent: 0,
      unitCostNZD: 0.85,
      markupPercent: 35.3,
      unitSellNZD: 1.15,
      totalNZD: 1840.00,
      formula: '=1600 * 1.15',
      notes: 'Installed at 400mm centers along tray seam.',
      supplier: 'The Roofing Store'
    },
    {
      id: 'row-7',
      sectionId: 'sec-5',
      itemCode: 'FAST-CL4-SS',
      description: 'Class 4 Galvanised / Marine 316 Low-Profile Fixing Screws',
      category: 'Hardware',
      quantity: 3200,
      unit: 'ea',
      wastagePercent: 5,
      unitCostNZD: 0.16,
      markupPercent: 37.5,
      unitSellNZD: 0.22,
      totalNZD: 704.00,
      formula: '=3200 * 0.22',
      notes: 'Wafer head for concealed clip fixing.',
    },
    // Section 4: Underlay
    {
      id: 'row-8',
      sectionId: 'sec-4',
      itemCode: 'UND-SYN-TRS',
      description: 'The Roofing Store Heavy-Duty Synthetic Breather Membrane Underlay',
      category: 'Underlay',
      quantity: 320,
      unit: 'm2',
      wastagePercent: 12,
      unitCostNZD: 4.80,
      markupPercent: 30.2,
      unitSellNZD: 6.25,
      totalNZD: 2000.00,
      formula: '=320 * 6.25',
      notes: '150mm laps taped with approved butyl tape.',
      supplier: 'The Roofing Store'
    },
    // Section 5: Labour
    {
      id: 'row-9',
      sectionId: 'sec-6',
      itemCode: 'LAB-SEAM-INSTALL',
      description: 'Archtech Certified LBP Standing Seam Installation & Mechanical Double Seaming',
      category: 'Labour',
      quantity: 285,
      unit: 'm2',
      wastagePercent: 0,
      unitCostNZD: 68.00,
      markupPercent: 25.0,
      unitSellNZD: 85.00,
      totalNZD: 24225.00,
      formula: '=285 * 85.00',
      notes: 'Marcus Kuhtze (LBP) site supervision & double mechanical seaming.',
      supplier: 'Archtech Internal Labour'
    },
    // Section 6: Freight
    {
      id: 'row-10',
      sectionId: 'sec-7',
      itemCode: 'FRT-TRS-HIAB',
      description: 'The Roofing Store Dedicated HIAB Crane Truck Delivery (Direct to Roof Level)',
      category: 'Freight',
      quantity: 2,
      unit: 'trip',
      wastagePercent: 0,
      unitCostNZD: 650.00,
      markupPercent: 15.4,
      unitSellNZD: 750.00,
      totalNZD: 1500.00,
      formula: '=2 * 750.00',
      notes: 'Matakana Coast delivery including specialized crane lift.',
      supplier: 'The Roofing Store Logistics'
    },
    // Section 7: Compliance
    {
      id: 'row-11',
      sectionId: 'sec-8',
      itemCode: 'COMP-PS3-CCC',
      description: 'Archtech Producer Statement PS3 Construction Sign-off for Council CCC',
      category: 'Compliance',
      quantity: 1,
      unit: 'sum',
      wastagePercent: 0,
      unitCostNZD: 650.00,
      markupPercent: 30.7,
      unitSellNZD: 850.00,
      totalNZD: 850.00,
      formula: '=1 * 850.00',
      notes: 'Official LBP record of work lodged for Auckland Council code compliance.',
      supplier: 'Archtech LBP'
    }
  ];

  const sections: SpreadsheetSection[] = activeQuote.spreadsheetSections || defaultSections;
  const rows: SpreadsheetRow[] = activeQuote.spreadsheetRows || defaultRows;

  // Calculate live totals from spreadsheet rows
  const subtotalNZD = rows.reduce((acc, r) => acc + (r.totalNZD || 0), 0);
  const costTotalNZD = rows.reduce((acc, r) => acc + ((r.unitCostNZD || 0) * (r.quantity || 0) * (1 + (r.wastagePercent || 0) / 100)), 0);
  const gstNZD = calculateGST(subtotalNZD).gst;
  const totalNZD = subtotalNZD + gstNZD;
  const grossMarginPercent = subtotalNZD > 0 ? Math.round(((subtotalNZD - costTotalNZD) / subtotalNZD) * 1000) / 10 : 0;
  const overallMarkupPercent = costTotalNZD > 0 ? Math.round(((subtotalNZD - costTotalNZD) / costTotalNZD) * 1000) / 10 : 0;

  // Synchronize spreadsheet rows back to quote state
  const syncQuoteSpreadsheet = (newSections: SpreadsheetSection[], newRows: SpreadsheetRow[]) => {
    const newSubtotal = newRows.reduce((acc, r) => acc + (r.totalNZD || 0), 0);
    const newCost = newRows.reduce((acc, r) => acc + ((r.unitCostNZD || 0) * (r.quantity || 0) * (1 + (r.wastagePercent || 0) / 100)), 0);
    const newGst = calculateGST(newSubtotal).gst;
    const newTotal = newSubtotal + newGst;

    const updated: Quote = {
      ...activeQuote,
      spreadsheetSections: newSections,
      spreadsheetRows: newRows,
      subtotalNZD: newSubtotal,
      costTotalNZD: newCost,
      gstNZD: newGst,
      totalNZD: newTotal,
      markupPercent: newCost > 0 ? Math.round(((newSubtotal - newCost) / newCost) * 100) : 18,
      marginPercent: newSubtotal > 0 ? Math.round(((newSubtotal - newCost) / newSubtotal) * 100) : 15
    };
    onUpdateQuote(updated);
  };

  // Cell Edit Handler (Real Excel inline editing)
  const handleCellChange = (rowId: string, field: keyof SpreadsheetRow, value: any) => {
    const updatedRows = rows.map(r => {
      if (r.id !== rowId) return r;

      const updatedRow = { ...r, [field]: value };

      // Recalculate if quantity, unitSellNZD, unitCostNZD, or wastage changed
      if (field === 'quantity' || field === 'unitSellNZD' || field === 'unitCostNZD' || field === 'markupPercent' || field === 'wastagePercent') {
        const qty = Number(field === 'quantity' ? value : r.quantity) || 0;
        let cost = Number(field === 'unitCostNZD' ? value : r.unitCostNZD) || 0;
        let markup = Number(field === 'markupPercent' ? value : r.markupPercent) || 0;
        let sell = Number(field === 'unitSellNZD' ? value : r.unitSellNZD) || 0;

        if (field === 'unitCostNZD' || field === 'markupPercent') {
          sell = Math.round(cost * (1 + markup / 100) * 100) / 100;
          updatedRow.unitSellNZD = sell;
        } else if (field === 'unitSellNZD' && cost > 0) {
          markup = Math.round(((sell - cost) / cost) * 1000) / 10;
          updatedRow.markupPercent = markup;
        }

        updatedRow.totalNZD = Math.round(qty * sell * 100) / 100;
        updatedRow.formula = `=${qty} * ${sell}`;
      }

      // If user typed directly into the formula
      if (field === 'formula' && typeof value === 'string' && value.startsWith('=')) {
        const calculated = evaluateFormula(value, r.totalNZD);
        updatedRow.totalNZD = calculated;
        if (r.quantity > 0) {
          updatedRow.unitSellNZD = Math.round((calculated / r.quantity) * 100) / 100;
        }
      }

      return updatedRow;
    });

    syncQuoteSpreadsheet(sections, updatedRows);
  };

  // Add a new row to a specific section
  const handleAddRowToSection = (sectionId: string) => {
    const newRow: SpreadsheetRow = {
      id: `row-${Date.now()}`,
      sectionId,
      itemCode: 'CUSTOM',
      description: 'New Architectural Scope Item (Custom Line)',
      category: 'General',
      quantity: 1,
      unit: 'sum',
      wastagePercent: 0,
      unitCostNZD: 250.00,
      markupPercent: 20,
      unitSellNZD: 300.00,
      totalNZD: 300.00,
      formula: '=1 * 300',
      notes: 'Custom line item entered directly into takeoff spreadsheet.',
      supplier: 'The Roofing Store'
    };
    syncQuoteSpreadsheet(sections, [...rows, newRow]);
  };

  // Delete a row
  const handleDeleteRow = (rowId: string) => {
    syncQuoteSpreadsheet(sections, rows.filter(r => r.id !== rowId));
  };

  // Add a brand new custom section
  const handleAddSection = () => {
    const sectionNum = sections.length + 1;
    const colors = ['border-l-sky-500', 'border-l-indigo-500', 'border-l-teal-500', 'border-l-emerald-500', 'border-l-amber-500', 'border-l-rose-500'];
    const newSection: SpreadsheetSection = {
      id: `sec-${Date.now()}`,
      title: `${sectionNum}. Custom Architectural Package (Section ${sectionNum})`,
      colorTag: colors[sectionNum % colors.length]
    };
    syncQuoteSpreadsheet([...sections, newSection], rows);
  };

  // Batch Markup Adjustment
  const handleApplyGlobalMarkup = (newMarkup: number) => {
    const updatedRows = rows.map(r => {
      const sell = Math.round(r.unitCostNZD * (1 + newMarkup / 100) * 100) / 100;
      return {
        ...r,
        markupPercent: newMarkup,
        unitSellNZD: sell,
        totalNZD: Math.round(r.quantity * sell * 100) / 100,
        formula: `=${r.quantity} * ${sell}`
      };
    });
    syncQuoteSpreadsheet(sections, updatedRows);
  };

  // Export to CSV / Excel
  const handleExportExcel = () => {
    exportToCSV(
      activeQuote.quoteNumber,
      activeQuote.clientName,
      sections,
      rows,
      subtotalNZD,
      gstNZD,
      totalNZD
    );
  };

  // Copy to Clipboard
  const handleCopyClipboard = async () => {
    const success = await copyTableForExcel(sections, rows);
    if (success) {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    }
  };

  // Paste from TSV / Excel
  const handleProcessPastedText = () => {
    if (!pastedText.trim()) return;
    const lines = pastedText.trim().split('\n');
    const newRowsToAdd: SpreadsheetRow[] = [];
    const targetSectionId = sections[0]?.id || 'sec-1';

    lines.forEach((line, idx) => {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const desc = parts[1] || parts[0] || 'Imported Line';
        const qty = Number(parts[2]) || Number(parts[1]) || 1;
        const unit = parts[3] || 'ea';
        const cost = Number(parts[4]) || 50;
        const sell = Number(parts[5]) || cost * 1.25;

        newRowsToAdd.push({
          id: `pasted-${Date.now()}-${idx}`,
          sectionId: targetSectionId,
          itemCode: parts[0] && parts[0].length < 15 ? parts[0] : 'IMP',
          description: desc,
          category: 'Pasted Items',
          quantity: qty,
          unit,
          wastagePercent: 0,
          unitCostNZD: cost,
          markupPercent: 25,
          unitSellNZD: sell,
          totalNZD: Math.round(qty * sell * 100) / 100,
          formula: `=${qty} * ${sell}`,
          notes: 'Pasted from external Excel / clipboard.'
        });
      }
    });

    if (newRowsToAdd.length > 0) {
      syncQuoteSpreadsheet(sections, [...rows, ...newRowsToAdd]);
      setIsPasteModalOpen(false);
      setPastedText('');
    }
  };

  // Import from Onsite Site Survey
  const handleImportSurveyTakeoff = () => {
    if (!activeTakeoffProject || !activeTakeoffProject.siteSurvey || !activeTakeoffProject.siteSurvey.lineItems?.length) {
      alert('Selected project does not have any recorded site survey measurements.');
      return;
    }

    const survey = activeTakeoffProject.siteSurvey;
    const traySection = sections.find(s => s.id === 'sec-1') || sections[0];
    const flashingSection = sections.find(s => s.id === 'sec-2') || sections[1] || sections[0];

    const newRows: SpreadsheetRow[] = [];

    (survey.lineItems || []).forEach((item, idx) => {
      const itemTitle = item.title || item.name || 'Measured Line';
      const isTray = item.category === 'Tray' || itemTitle.toLowerCase().includes('tray') || itemTitle.toLowerCase().includes('seam');
      const targetSec = isTray ? traySection.id : flashingSection.id;
      const count = item.count || 1;
      const effectiveLengthMm = item.slopeLengthMm || item.measuredLengthMm || item.lengthMm || 0;
      const totalLm = Math.round(((effectiveLengthMm / 1000) * count) * 10) / 10;

      let unitSell = 34.50;
      let unitCost = 28.00;
      let category = isTray ? 'Roofing Trays' : 'Flashings';
      let itemCode = item.code || (isTray ? 'SS-38' : 'FL-CUSTOM');

      if (!isTray) {
        // Girth pricing
        const tier = item.girthTier || '301-450mm';
        switch (tier) {
          case '0-150mm': unitSell = 24.50; unitCost = 18.00; break;
          case '151-300mm': unitSell = 31.50; unitCost = 23.50; break;
          case '301-450mm': unitSell = 39.00; unitCost = 29.50; break;
          case '451-600mm': unitSell = 47.00; unitCost = 36.00; break;
          case '601-900mm': unitSell = 59.00; unitCost = 45.00; break;
          case '901-1200mm': unitSell = 74.00; unitCost = 57.00; break;
        }
      }

      newRows.push({
        id: `survey-takeoff-${Date.now()}-${idx}`,
        sectionId: targetSec,
        itemCode,
        description: `${itemTitle} (${item.slopeLengthMm ? 'True Rafter Slope ' + (item.slopeLengthMm/1000).toFixed(2) + 'm' : ((item.measuredLengthMm || item.lengthMm || 0)/1000).toFixed(2) + 'm'}${item.girthTier ? ', Girth: ' + item.girthTier : ''})`,
        category,
        quantity: totalLm,
        unit: 'lm',
        wastagePercent: 5,
        unitCostNZD: unitCost,
        markupPercent: Math.round(((unitSell - unitCost) / unitCost) * 100),
        unitSellNZD: unitSell,
        totalNZD: Math.round(totalLm * unitSell * 100) / 100,
        formula: `=${totalLm} * ${unitSell}`,
        notes: `Imported from Onsite Survey (${survey.surveyNumber || 'SURV-01'}) - Measured by ${survey.surveyorName || survey.surveyor || 'LBP Roofer'}`,
        supplier: isTray ? 'The Roofing Store (Albany)' : 'Archtech Workshop'
      });
    });

    if (newRows.length > 0) {
      syncQuoteSpreadsheet(sections, [...rows, ...newRows]);
      setTakeoffToast(`Successfully imported ${newRows.length} measured line items (${survey.surveyNumber || 'Site Survey'}) into takeoff matrix!`);
      setTimeout(() => setTakeoffToast(null), 4000);
      setIsTakeoffModalOpen(false);
    }
  };

  // Import from Flashing Pins / Workshop Orders
  const handleImportFlashingPinsTakeoff = () => {
    if (!activeTakeoffProject) return;
    const pins = activeTakeoffProject.flashingPins || [];
    if (!pins.length) {
      alert('Selected project does not have any drawing flashing pins.');
      return;
    }

    const flashingSection = sections.find(s => s.id === 'sec-2') || sections[1] || sections[0];
    const newRows: SpreadsheetRow[] = [];

    pins.forEach((pin, idx) => {
      const totalLm = Math.round((pin.lengthLm * (pin.quantity || 1)) * 10) / 10;
      let unitSell = 39.00;
      let unitCost = 29.50;
      const tier = pin.girthTier || '301-450mm';
      switch (tier) {
        case '0-150mm': unitSell = 24.50; unitCost = 18.00; break;
        case '151-300mm': unitSell = 31.50; unitCost = 23.50; break;
        case '301-450mm': unitSell = 39.00; unitCost = 29.50; break;
        case '451-600mm': unitSell = 47.00; unitCost = 36.00; break;
        case '601-900mm': unitSell = 59.00; unitCost = 45.00; break;
        case '901-1200mm': unitSell = 74.00; unitCost = 57.00; break;
      }

      newRows.push({
        id: `pin-takeoff-${Date.now()}-${idx}`,
        sectionId: flashingSection.id,
        itemCode: pin.label.split(' ')[0] || 'FL-PIN',
        description: `${pin.profileName} [${pin.label}] (${pin.girthTier || '301-450mm'}, ${pin.material || 'Vitor+ 0.55mm'})`,
        category: 'Flashings',
        quantity: totalLm,
        unit: 'lm',
        wastagePercent: 5,
        unitCostNZD: unitCost,
        markupPercent: Math.round(((unitSell - unitCost) / unitCost) * 100),
        unitSellNZD: unitSell,
        totalNZD: Math.round(totalLm * unitSell * 100) / 100,
        formula: `=${totalLm} * ${unitSell}`,
        notes: `Imported from CAD Drawing Pin (${pin.planId || 'Plan RC-01'}) - ${pin.notes || ''}`,
        supplier: 'Archtech Workshop'
      });
    });

    if (newRows.length > 0) {
      syncQuoteSpreadsheet(sections, [...rows, ...newRows]);
      setTakeoffToast(`Successfully imported ${newRows.length} flashing pins from architectural drawing markups into quote!`);
      setTimeout(() => setTakeoffToast(null), 4000);
      setIsTakeoffModalOpen(false);
    }
  };

  // Client Portal interactive options
  const [selectedOptionalUpgrades, setSelectedOptionalUpgrades] = useState<{ [id: string]: boolean }>({
    'opt-1': false,
    'opt-2': true,
    'opt-3': false
  });

  const optionalUpgradesList = [
    {
      id: 'opt-1',
      title: 'Kiwicolour® Zenex+ Extreme Coastal Heavy Coating Upgrade',
      description: 'Increases marine warranty from 20 to 25 years with upgraded 200g/m² zinc-aluminium substrate.',
      additionalCostNZD: 4200.00
    },
    {
      id: 'opt-2',
      title: 'Integrated Velux Skylight Custom Flashing & Trimming Package',
      description: 'Custom folded saddle and side soaker aprons factory hemmed to Super Seam 38mm pans.',
      additionalCostNZD: 1850.00
    },
    {
      id: 'opt-3',
      title: 'Architectural Snow & Ice Retention Cleats (Central Otago Prep)',
      description: 'Extruded dual-bar powdercoated snow guards mechanically clamped to standing seams.',
      additionalCostNZD: 3100.00
    }
  ];

  const upgradesTotal = optionalUpgradesList
    .filter(u => selectedOptionalUpgrades[u.id])
    .reduce((sum, u) => sum + u.additionalCostNZD, 0);

  const clientPortalSubtotal = subtotalNZD + upgradesTotal;
  const clientPortalGst = calculateGST(clientPortalSubtotal).gst;
  const clientPortalGrandTotal = clientPortalSubtotal + clientPortalGst;

  // Handle Client Acceptance
  const handleClientAcceptQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientSignerName.trim() || !clientAgreedTerms) return;

    setIsSignedSuccess(true);
    const updated: Quote = {
      ...activeQuote,
      status: 'accepted',
      clientSignature: clientSignerName,
      signedAt: new Date().toISOString()
    };
    onUpdateQuote(updated);
  };

  return (
    <div className="space-y-4">
      {/* Streamlined Quote Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="font-semibold text-slate-800">Quotes & Takeoffs</span>
              <span>·</span>
              <span className="truncate">{activeQuote.clientName}</span>
              <span>·</span>
              <span className="truncate">{activeQuote.siteAddress}</span>
            </div>

            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <span>{activeQuote.quoteNumber}</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                  {activeQuote.revision || 'Rev A'} (v{activeQuote.version || 1}.0)
                </span>
              </h1>

              {/* Status indicator badge */}
              <span className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase font-mono ${
                activeQuote.status === 'accepted'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : activeQuote.status === 'superseded'
                  ? 'bg-slate-100 text-slate-600'
                  : (activeQuote.status === 'expired' || isQuoteExpired(activeQuote))
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {activeQuote.status === 'accepted' ? 'Accepted & Locked' : activeQuote.status === 'superseded' ? 'Superseded' : (activeQuote.status === 'expired' || isQuoteExpired(activeQuote)) ? 'Expired' : 'Active Open'}
              </span>

              {/* Smart NZBC E2/AS1 Code & Durability Audit Badge */}
              <button
                type="button"
                onClick={() => setIsComplianceAuditorOpen(true)}
                className={`px-2.5 py-0.5 rounded text-xs font-semibold font-mono flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs ${
                  liveAuditResult.status === 'compliant'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                    : liveAuditResult.status === 'warning'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                    : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                }`}
                title="Click to inspect real-time NZBC E2/AS1 Code & Durability Audit"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>NZBC {liveAuditResult.overallScore}%</span>
                {liveAuditResult.issues.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                )}
              </button>
            </div>
          </div>

          {/* Primary Action Zone */}
          <div className="flex flex-wrap items-center gap-2">
            {/* ApexMap™ Studio (Quoting Mode) */}
            <button
              type="button"
              onClick={() => setIsApexStudioModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-all cursor-pointer shadow-2xs"
              title="Sketch & model this roof in ApexMap Studio (Quoting Mode) and push BOM directly to quote"
            >
              <Compass className="w-3.5 h-3.5 text-emerald-200" />
              <span>ApexMap™ Studio</span>
            </button>

            {/* Smart Scope AI Takeoff Button */}
            <button
              type="button"
              onClick={() => setIsSmartTakeoffModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-700 hover:to-purple-700 rounded-lg transition-all cursor-pointer shadow-2xs"
              title="Generate complete architectural scope using smart takeoff engine & AI"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-200 animate-pulse" />
              <span>Smart Scope AI</span>
            </button>

            {/* Quote Selector */}
            <select
              value={selectedQuoteId}
              onChange={(e) => setSelectedQuoteId(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              {quotes.map((q) => {
                const effStatus = getEffectiveQuoteStatus(q);
                return (
                  <option key={q.id} value={q.id}>
                    {q.quoteNumber} — {q.clientName} [{effStatus.toUpperCase()}]
                  </option>
                );
              })}
            </select>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('spreadsheet')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'spreadsheet'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Takeoff Matrix
              </button>
              <button
                type="button"
                onClick={() => setViewMode('client_portal')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'client_portal'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Proposal Preview
              </button>
            </div>

            {/* Save Draft */}
            <button
              type="button"
              onClick={handleSaveDraft}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Save working draft"
            >
              <Check className="w-3.5 h-3.5 text-slate-600" />
              <span>Save Draft</span>
            </button>

            {/* Issue & Send */}
            <button
              type="button"
              onClick={handleIssueAndSend}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
              title="Issue quote, set to Sent, and copy secure client portal link"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Issue & Send</span>
            </button>

            {/* Compare Versions */}
            <button
              type="button"
              onClick={() => setIsCompareModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Compare with another quote version or spec"
            >
              <GitCompare className="w-3.5 h-3.5 text-indigo-600" />
              <span>Compare</span>
            </button>

            {/* Client Portal Preview Button */}
            {onOpenClientPortalQuote && (
              <button
                type="button"
                onClick={() => onOpenClientPortalQuote(activeQuote.id, activeQuote.projectId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Preview client portal"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Portal View</span>
              </button>
            )}

            {/* Consolidated Actions Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsQuoteActionsOpen(!isQuoteActionsOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <span>Actions</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>

              {isQuoteActionsOpen && (
                <div 
                  className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-lg border border-slate-200 shadow-xl py-1.5 z-50 text-xs divide-y divide-slate-100"
                  onClick={() => setIsQuoteActionsOpen(false)}
                >
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => setIsNewVersionModalOpen(true)}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-sky-600" />
                      <span>New Version (v{(activeQuote.version || 1) + 1})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRecalculateCurrentMatrix}
                      disabled={!canApplyPriceMatrix(activeQuote)}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer disabled:opacity-40"
                    >
                      <Calculator className="w-3.5 h-3.5 text-sky-600" />
                      <span>Update Against Price Matrix</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSwitchProfile(activeQuote.profile || 'Archtech Super Seam 38mm');
                        setSwitchMaterial(activeQuote.material || 'The Roofing Store MagnaFlow®');
                        setIsSwitchSpecModalOpen(true);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5 text-purple-600" />
                      <span>Switch Profile / Material Spec</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyClientLink}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Client Proposal Link</span>
                    </button>
                  </div>

                  {activeQuote.status !== 'accepted' && (
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSignerNameInput(activeQuote.clientName || 'Client Authoriser');
                          setIsAcceptModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 flex items-center gap-2 text-emerald-800 cursor-pointer font-medium"
                      >
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Mark as Accepted (Lock)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDeclineReasonInput('Client requested scope revision');
                          setIsDeclineModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-rose-50 flex items-center gap-2 text-rose-800 cursor-pointer"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Mark as Declined</span>
                      </button>
                    </div>
                  )}

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => setIsOneDriveModalOpen(true)}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer"
                    >
                      <Cloud className="w-3.5 h-3.5 text-sky-600" />
                      <span>OneDrive Cloud Folders</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-800 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export to Excel (.CSV)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Immutability & 30-Day Notice Banner */}
        {activeQuote.status === 'accepted' && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-950 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Legally Locked:</strong> Accepted on {formatDate(activeQuote.signedAt || activeQuote.issueDate || '')} by {activeQuote.acceptedBy?.name || activeQuote.clientSignature || activeQuote.clientName}. Contract total {formatNZD(activeQuote.totalNZD)} is fixed. Under the Archtech high-trust rules, price matrix updates never apply to accepted quotes. To adjust scope, click <strong>+ New Version</strong>.
              </span>
            </div>
            <span className="font-mono text-[10px] bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded font-bold uppercase shrink-0">
              Locked
            </span>
          </div>
        )}

        {(activeQuote.status === 'expired' || isQuoteExpired(activeQuote)) && activeQuote.status !== 'accepted' && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-950 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>30-Day Validity Expired:</strong> Quote issued {formatDate(activeQuote.issueDate || '')} (expired {formatDate(activeQuote.validUntil || activeQuote.expiresAt || '')}). In the client portal, Accept/Decline has been disabled and replaced with &quot;Request current pricing&quot;. Click <strong>Update Price Matrix</strong> to refresh unit rates and issue the next version.
              </span>
            </div>
            <button
              onClick={handleRecalculateCurrentMatrix}
              className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded font-bold text-[11px] shrink-0 cursor-pointer"
            >
              Refresh Pricing Now
            </button>
          </div>
        )}

        {/* Financial KPI Summary Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-3 border-t border-slate-100 text-xs">
          <div className="p-2.5 rounded bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block text-[10px] font-mono">Wholesale Cost (TRS & Labour)</span>
            <span className="font-mono font-bold text-slate-900 text-sm">{formatNZD(costTotalNZD)}</span>
          </div>
          <div className="p-2.5 rounded bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block text-[10px] font-mono">Sell Subtotal (Excl. GST)</span>
            <span className="font-mono font-bold text-slate-900 text-sm">{formatNZD(subtotalNZD)}</span>
          </div>
          <div className="p-2.5 rounded bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block text-[10px] font-mono">Gross Margin</span>
            <span className="font-mono font-bold text-emerald-700 text-sm">{grossMarginPercent}%</span>
            <span className="text-[10px] text-slate-500 font-mono block">Markup: {overallMarkupPercent}%</span>
          </div>
          <div className="p-2.5 rounded bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block text-[10px] font-mono">GST (15% NZ)</span>
            <span className="font-mono font-bold text-slate-700 text-sm">{formatNZD(gstNZD)}</span>
          </div>
          <div className="p-2.5 rounded bg-slate-900 text-white border border-slate-800">
            <span className="text-slate-300 block text-[10px] font-mono">Total Incl. GST</span>
            <span className="font-mono font-bold text-emerald-400 text-base">{formatNZD(totalNZD)}</span>
          </div>
        </div>
      </div>

      {copiedToast && (
        <div className="p-2 bg-emerald-50 border border-emerald-300 rounded text-xs text-emerald-900 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Copied complete spreadsheet matrix to clipboard! You can now paste directly into Microsoft Excel or Google Sheets.</span>
        </div>
      )}

      {takeoffToast && (
        <div className="p-2.5 bg-sky-50 border border-sky-300 rounded text-xs text-sky-900 font-medium flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
            <span>{takeoffToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setTakeoffToast(null)}
            className="text-sky-700 hover:text-sky-900 font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: EXCEL-GRADE SPREADSHEET MATRIX VIEW */}
      {/* ========================================================================= */}
      {viewMode === 'spreadsheet' && (
        <div className="space-y-3">
          {/* Spreadsheet Controls & Formula Bar */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs space-y-2.5">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddSection}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer shadow-2xs"
                  title="Add a new scope section (e.g. Roofing, Wall Cladding, Rainwater, Flashings)"
                >
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  <span>+ Add Scope Section</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsTakeoffModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded transition-colors cursor-pointer shadow-2xs"
                  title="Import ApexMap Roof BOM, field survey measures, or architectural drawing pins into quote matrix"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 text-sky-600" />
                  <span>Import Takeoff (BOM / Survey)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPasteModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                  title="Paste tab-separated rows from Excel directly into this quote"
                >
                  <FileUp className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Paste from Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyClipboard}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                  title="Copy formatted table to paste into Excel"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy for Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors cursor-pointer shadow-2xs"
                  title="Download .CSV spreadsheet matrix for Microsoft Excel"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export to Excel (.CSV)</span>
                </button>
              </div>

              {/* Column Visibility Toggles & Batch Markup */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
                  <span className="text-[11px] text-slate-500 font-medium">Columns:</span>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={showCostColumns}
                      onChange={(e) => setShowCostColumns(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600"
                    />
                    <span>Cost & Markup</span>
                  </label>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={showWastageColumn}
                      onChange={(e) => setShowWastageColumn(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600"
                    />
                    <span>Wastage %</span>
                  </label>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={showFormulaColumn}
                      onChange={(e) => setShowFormulaColumn(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600"
                    />
                    <span>Formulas</span>
                  </label>
                </div>

                {/* Quick Markup Preset */}
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-slate-500 font-mono">Batch Markup:</span>
                  {[15, 20, 25].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleApplyGlobalMarkup(pct)}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono cursor-pointer"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Formula Bar (Excel fx bar) */}
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200 text-xs">
              <div className="w-16 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-slate-700 text-center shrink-0">
                {selectedCellInfo.cellLabel}
              </div>
              <div className="px-2 font-mono font-bold text-slate-400 italic shrink-0">fx</div>
              <input
                type="text"
                placeholder="Enter mathematical formula (e.g. =285 * 34.50) or type cell value directly..."
                value={selectedCellInfo.value}
                onChange={(e) => {
                  setSelectedCellInfo(prev => ({ ...prev, value: e.target.value }));
                  if (selectedCellInfo.rowId && selectedCellInfo.colKey) {
                    handleCellChange(selectedCellInfo.rowId, selectedCellInfo.colKey as any, e.target.value);
                  }
                }}
                className="flex-1 px-3 py-1 bg-white border border-slate-300 rounded font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600"
              />
            </div>
          </div>

          {/* Excel Spreadsheet Table Sections */}
          <div className="space-y-4">
            {sections.map((section, sIdx) => {
              const sectionRows = rows.filter(r => r.sectionId === section.id);
              const sectionCost = sectionRows.reduce((sum, r) => sum + ((r.unitCostNZD || 0) * (r.quantity || 0) * (1 + (r.wastagePercent || 0) / 100)), 0);
              const sectionSell = sectionRows.reduce((sum, r) => sum + (r.totalNZD || 0), 0);
              const sectionMargin = sectionSell > 0 ? Math.round(((sectionSell - sectionCost) / sectionSell) * 1000) / 10 : 0;

              return (
                <div key={section.id} className={`bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden border-l-4 ${section.colorTag}`}>
                  {/* Section Header */}
                  <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2.5">
                    {/* Top Row: Title, Scope Area (m²), Cost, Subtotal */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-400 text-xs">#{sIdx + 1}</span>
                        <input
                          type="text"
                          value={section.title}
                          onChange={(e) => {
                            const updated = sections.map(s => s.id === section.id ? { ...s, title: e.target.value } : s);
                            syncQuoteSpreadsheet(updated, rows);
                          }}
                          className="font-bold text-slate-900 text-xs bg-transparent hover:bg-white px-2 py-0.5 rounded border border-transparent hover:border-slate-300 focus:bg-white focus:border-slate-800 focus:outline-none w-72 sm:w-80"
                        />
                        <span className="text-[11px] font-mono text-slate-400">({sectionRows.length} lines)</span>

                        {/* Scope Area (Total m²) Input */}
                        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs ml-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Scope Area:</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={section.totalM2 ?? ''}
                            onChange={(e) => handleSectionFieldChange(section.id, 'totalM2', e.target.value === '' ? undefined : Number(e.target.value))}
                            placeholder="m²"
                            className="w-16 font-mono font-bold text-xs text-slate-900 bg-slate-50 hover:bg-white px-1.5 py-0.5 rounded border border-slate-200 focus:border-sky-500 focus:bg-white focus:outline-none text-right"
                            title="Total square metres for this scope package (defines client scope & calculates rates)"
                          />
                          <span className="text-slate-600 font-mono text-xs font-semibold">m²</span>
                          {section.totalM2 && section.totalM2 > 0 && (
                            <span className="text-[10px] font-mono text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded font-semibold ml-0.5" title="Effective package rate per m²">
                              {formatNZD(sectionSell / section.totalM2)}/m²
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-2 font-mono">
                          {showCostColumns && (
                            <span className="text-slate-400 text-[11px]">Cost: {formatNZD(sectionCost)}</span>
                          )}
                          <span className="font-bold text-slate-900">Subtotal: {formatNZD(sectionSell)}</span>
                          {showCostColumns && (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                              {sectionMargin}% Margin
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Universal Material Cascade & Scoped Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-xs">
                      {/* Left: Universal Material & Profile Specs */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Universal Section Material */}
                        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs">
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Universal Material:</span>
                          <select
                            value={section.defaultMaterial || activeQuote.material || 'The Roofing Store MagnaFlow®'}
                            onChange={(e) => handleSectionMaterialChange(section.id, e.target.value as CoilMaterial)}
                            className="text-xs font-semibold bg-transparent text-slate-900 focus:outline-none cursor-pointer"
                            title="Selecting a material updates all lines in this section with automatic price recalculation"
                          >
                            {MODULAR_COIL_MATERIALS.map(m => (
                              <option key={m.material} value={m.material}>
                                {m.material.replace(' (The Roofing Store)', '')}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* If Roof or Wall Cladding, show Profile & Pan width selectors + Auto-calc Trays button */}
                        {(section.sectionType === 'roof' || section.sectionType === 'wall_cladding' || sIdx <= 1) && (
                          <>
                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Profile:</span>
                              <select
                                value={section.defaultProfile || (section.sectionType === 'wall_cladding' ? 'Archtech Interlocking Panels' : 'Archtech Super Seam 38mm')}
                                onChange={(e) => handleSectionProfileChange(section.id, e.target.value as RoofingProfile)}
                                className="text-xs font-semibold bg-transparent text-slate-800 focus:outline-none cursor-pointer"
                              >
                                {MODULAR_TRAY_PROFILES.map(p => (
                                  <option key={p.profile} value={p.profile}>{p.profile}</option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Pan:</span>
                              <select
                                value={section.defaultPanSizeMm || (section.sectionType === 'wall_cladding' ? 300 : 450)}
                                onChange={(e) => handleSectionPanSizeChange(section.id, Number(e.target.value))}
                                className="text-xs font-mono font-medium bg-transparent text-slate-800 focus:outline-none cursor-pointer"
                              >
                                <option value={300}>300mm Pan</option>
                                <option value={350}>350mm Pan</option>
                                <option value={400}>400mm Pan</option>
                                <option value={450}>450mm Pan</option>
                                <option value={500}>500mm Pan</option>
                                <option value={530}>530mm Pan</option>
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCalculateTrayLmFromM2(section.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded transition-colors cursor-pointer shadow-2xs"
                              title="Calculate required lineal metres from section Scope Area (m²) and pan width"
                            >
                              <span>📐 Calc Trays (lm)</span>
                            </button>
                          </>
                        )}
                      </div>

                      {/* Right: Scoped Deliberate Add Buttons */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(section.sectionType === 'roof' || (!section.sectionType && sIdx === 0)) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAddTrayLine(section.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded transition-colors cursor-pointer"
                              title="Add roll-formed standing seam tray line to this roof package"
                            >
                              <Plus className="w-3 h-3 text-sky-600" />
                              <span>+ Roof Tray</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddFlashingLine(section.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer"
                              title="Add custom folded flashing to this roof package"
                            >
                              <Plus className="w-3 h-3 text-amber-600" />
                              <span>+ Flashing</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddAccessoryLine(section.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded transition-colors cursor-pointer"
                              title="Add fixing clip or accessory"
                            >
                              <Plus className="w-3 h-3 text-purple-600" />
                              <span>+ Hardware</span>
                            </button>
                          </>
                        )}

                        {(section.sectionType === 'wall_cladding' || (!section.sectionType && sIdx === 1)) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAddTrayLine(section.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded transition-colors cursor-pointer"
                              title="Add interlocking cladding panel to this wall package"
                            >
                              <Plus className="w-3 h-3 text-sky-600" />
                              <span>+ Cladding Panel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddFlashingLine(section.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer"
                              title="Add head or jamb flashing to this wall package"
                            >
                              <Plus className="w-3 h-3 text-amber-600" />
                              <span>+ Head/Jamb Flashing</span>
                            </button>
                          </>
                        )}

                        {(section.sectionType === 'rainwater' || (!section.sectionType && sIdx === 3)) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAddRainwaterLine(section.id, 'RW-SP-150HR')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors cursor-pointer"
                              title="Add 150mm half-round continuous spouting line"
                            >
                              <Plus className="w-3 h-3 text-teal-600" />
                              <span>+ 150 Spouting</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddRainwaterLine(section.id, 'RW-DP-100R')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors cursor-pointer"
                              title="Add 100mm round downpipes"
                            >
                              <Plus className="w-3 h-3 text-teal-600" />
                              <span>+ Downpipe</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddRainwaterLine(section.id, 'RW-RH-BOX')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors cursor-pointer"
                              title="Add box rainhead"
                            >
                              <Plus className="w-3 h-3 text-teal-600" />
                              <span>+ Rainhead</span>
                            </button>
                          </>
                        )}

                        {(section.sectionType === 'flashings' || (!section.sectionType && sIdx === 2)) && (
                          <button
                            type="button"
                            onClick={() => handleAddFlashingLine(section.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors cursor-pointer"
                            title="Add custom folded flashing"
                          >
                            <Plus className="w-3 h-3 text-amber-600" />
                            <span>+ Custom Flashing</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleAddRowToSection(section.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded transition-colors cursor-pointer"
                          title="Add a custom item row to this section"
                        >
                          <Plus className="w-3 h-3 text-slate-500" />
                          <span>+ Add Line</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Matrix Spreadsheet Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs font-mono">
                      <thead className="bg-slate-100/70 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-2.5 w-10 text-center">#</th>
                          <th className="py-2 px-2 w-24">Item Code</th>
                          <th className="py-2 px-3 min-w-[260px] font-sans">Scope Description / Spec</th>
                          <th className="py-2 px-2.5 w-24">Category</th>
                          <th className="py-2 px-2 w-20 text-right">Qty</th>
                          <th className="py-2 px-2 w-16">Unit</th>
                          {showWastageColumn && <th className="py-2 px-2 w-16 text-right">Waste %</th>}
                          {showCostColumns && <th className="py-2 px-2 w-24 text-right">Unit Cost</th>}
                          {showCostColumns && <th className="py-2 px-2 w-20 text-right">Markup %</th>}
                          <th className="py-2 px-2 w-24 text-right">Sell Rate</th>
                          <th className="py-2 px-3 w-28 text-right bg-slate-100 font-bold">Line Total</th>
                          {showFormulaColumn && <th className="py-2 px-3 min-w-[200px]">Formula / Calc</th>}
                          <th className="py-2 px-2 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {sectionRows.map((row, rIdx) => {
                          const isTrayRow = row.matrixType === 'tray' || (row.sectionId === 'sec-1' && !row.matrixType) || row.category === 'Roofing Trays';
                          const isFlashingRow = row.matrixType === 'flashing' || (row.sectionId === 'sec-2' && !row.matrixType) || row.category === 'Flashings';
                          const isRainwaterRow = row.matrixType === 'rainwater' || row.category === 'Rainwater Goods';

                          return (
                          <tr key={row.id} className="hover:bg-sky-50/50 transition-colors group">
                            {/* Row Index */}
                            <td className="py-1 px-2.5 text-center text-slate-400 text-[10px]">
                              {rIdx + 1}
                            </td>

                            {/* Item Code */}
                            <td className="py-1 px-2">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={row.itemCode || ''}
                                  onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'itemCode', cellLabel: `B${rIdx+1}`, value: row.itemCode || '' })}
                                  onChange={(e) => handleCellChange(row.id, 'itemCode', e.target.value)}
                                  className="w-full bg-transparent px-1.5 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-slate-700 font-semibold text-[11px]"
                                />
                                {row.isMatrixItem && (
                                  <span className="text-[9px] font-mono text-sky-700 bg-sky-50 border border-sky-200 px-1 rounded uppercase shrink-0 font-bold" title="Dynamic Pricing Matrix item">
                                    DYN
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Description / Dynamic Matrix Selectors */}
                            <td className="py-1.5 px-3 font-sans">
                              {isTrayRow ? (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {/* Profile */}
                                    <select
                                      value={row.profile || section.defaultProfile || activeQuote.profile || 'Archtech Super Seam 38mm'}
                                      onChange={(e) => handleMatrixVariableChange(row.id, 'profile', e.target.value)}
                                      className="text-[11px] font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-900 focus:ring-1 focus:ring-sky-500 cursor-pointer"
                                      title="Profile"
                                    >
                                      {MODULAR_TRAY_PROFILES.map(p => (
                                        <option key={p.profile} value={p.profile}>{p.profile}</option>
                                      ))}
                                    </select>

                                    {/* Material */}
                                    <select
                                      value={row.material || section.defaultMaterial || activeQuote.material || 'The Roofing Store MagnaFlow®'}
                                      onChange={(e) => handleMatrixVariableChange(row.id, 'material', e.target.value)}
                                      className="text-[11px] bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 focus:ring-1 focus:ring-sky-500 cursor-pointer"
                                      title="Material"
                                    >
                                      {MODULAR_COIL_MATERIALS.map(m => (
                                        <option key={m.material} value={m.material}>{m.material.replace(' (The Roofing Store)', '')}</option>
                                      ))}
                                    </select>

                                    {/* Pan Size */}
                                    <select
                                      value={row.panSizeMm || section.defaultPanSizeMm || 450}
                                      onChange={(e) => handleMatrixVariableChange(row.id, 'panSizeMm', Number(e.target.value))}
                                      className="text-[11px] font-mono font-medium bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 focus:ring-1 focus:ring-sky-500 cursor-pointer"
                                      title="Pan Width"
                                    >
                                      <option value={300}>300mm Pan</option>
                                      <option value={350}>350mm Pan</option>
                                      <option value={400}>400mm Pan</option>
                                      <option value={450}>450mm Pan (Std)</option>
                                      <option value={500}>500mm Pan</option>
                                      <option value={530}>530mm Pan</option>
                                    </select>
                                  </div>

                                  <input
                                    type="text"
                                    value={row.description}
                                    onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'description', cellLabel: `C${rIdx+1}`, value: row.description })}
                                    onChange={(e) => handleCellChange(row.id, 'description', e.target.value)}
                                    className="w-full bg-transparent px-1 py-0.5 rounded text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus:bg-white focus:text-slate-900 focus:outline-none"
                                    placeholder="Specification note or description..."
                                  />
                                </div>
                              ) : isFlashingRow ? (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {/* Flashing Type */}
                                    <select
                                      value={row.flashingType || 'Ridge Cap Vent'}
                                      onChange={(e) => handleMatrixVariableChange(row.id, 'flashingType', e.target.value)}
                                      className="text-[11px] font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-900 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                                      title="Flashing Type"
                                    >
                                      {MODULAR_FLASHING_TYPES.map(ft => (
                                        <option key={ft.type} value={ft.type}>{ft.type}</option>
                                      ))}
                                    </select>

                                    {/* Material */}
                                    <select
                                      value={row.material || section.defaultMaterial || activeQuote.material || 'The Roofing Store MagnaFlow®'}
                                      onChange={(e) => handleMatrixVariableChange(row.id, 'material', e.target.value)}
                                      className="text-[11px] bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                                      title="Material"
                                    >
                                      {MODULAR_COIL_MATERIALS.map(m => (
                                        <option key={m.material} value={m.material}>{m.material.replace(' (The Roofing Store)', '')}</option>
                                      ))}
                                    </select>

                                    {/* Girth Tier */}
                                    <select
                                      value={row.girthTier || '301-450mm'}
                                      onChange={(e) => handleMatrixVariableChange(row.id, 'girthTier', e.target.value)}
                                      className="text-[11px] font-mono font-medium bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                                      title="Girth Band"
                                    >
                                      <option value="0-150mm">0-150mm</option>
                                      <option value="151-300mm">151-300mm</option>
                                      <option value="301-450mm">301-450mm</option>
                                      <option value="451-600mm">451-600mm</option>
                                      <option value="601-900mm">601-900mm</option>
                                      <option value="901-1200mm">901-1200mm</option>
                                    </select>
                                  </div>

                                  <input
                                    type="text"
                                    value={row.description}
                                    onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'description', cellLabel: `C${rIdx+1}`, value: row.description })}
                                    onChange={(e) => handleCellChange(row.id, 'description', e.target.value)}
                                    className="w-full bg-transparent px-1 py-0.5 rounded text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus:bg-white focus:text-slate-900 focus:outline-none"
                                    placeholder="Specification note or description..."
                                  />
                                </div>
                              ) : isRainwaterRow ? (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {/* Rainwater Product Selector */}
                                    <select
                                      value={row.rainwaterProfile || row.description || '150mm Half-Round Continuous Spouting'}
                                      onChange={(e) => handleMatrixVariableChange(row.id, 'rainwaterProfile', e.target.value)}
                                      className="text-[11px] font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-900 focus:ring-1 focus:ring-teal-500 cursor-pointer"
                                      title="Rainwater Profile / Product"
                                    >
                                      {MODULAR_RAINWATER_PRODUCTS.map(rw => (
                                        <option key={rw.code} value={rw.name}>{rw.name} ({rw.unit})</option>
                                      ))}
                                    </select>

                                    {/* Material */}
                                    <select
                                      value={row.material || section.defaultMaterial || activeQuote.material || 'The Roofing Store MagnaFlow®'}
                                      onChange={(e) => handleMatrixVariableChange(row.id, 'material', e.target.value)}
                                      className="text-[11px] bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 focus:ring-1 focus:ring-teal-500 cursor-pointer"
                                      title="Material"
                                    >
                                      {MODULAR_COIL_MATERIALS.map(m => (
                                        <option key={m.material} value={m.material}>{m.material.replace(' (The Roofing Store)', '')}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <input
                                    type="text"
                                    value={row.description}
                                    onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'description', cellLabel: `C${rIdx+1}`, value: row.description })}
                                    onChange={(e) => handleCellChange(row.id, 'description', e.target.value)}
                                    className="w-full bg-transparent px-1 py-0.5 rounded text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus:bg-white focus:text-slate-900 focus:outline-none"
                                    placeholder="Specification note or description..."
                                  />
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={row.description}
                                  onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'description', cellLabel: `C${rIdx+1}`, value: row.description })}
                                  onChange={(e) => handleCellChange(row.id, 'description', e.target.value)}
                                  className="w-full bg-transparent px-1.5 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-slate-900 font-medium text-xs"
                                />
                              )}
                            </td>

                            {/* Category */}
                            <td className="py-1 px-2">
                              <input
                                type="text"
                                value={row.category || ''}
                                onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'category', cellLabel: `D${rIdx+1}`, value: row.category || '' })}
                                onChange={(e) => handleCellChange(row.id, 'category', e.target.value)}
                                className="w-full bg-transparent px-1.5 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-slate-500 text-[11px]"
                              />
                            </td>

                            {/* Quantity */}
                            <td className="py-1 px-2">
                              <input
                                type="number"
                                step="any"
                                value={row.quantity}
                                onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'quantity', cellLabel: `E${rIdx+1}`, value: String(row.quantity) })}
                                onChange={(e) => handleCellChange(row.id, 'quantity', e.target.value)}
                                className="w-full bg-transparent px-1.5 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-right font-bold text-slate-900 text-xs"
                              />
                            </td>

                            {/* Unit */}
                            <td className="py-1 px-2">
                              <select
                                value={row.unit}
                                onChange={(e) => handleCellChange(row.id, 'unit', e.target.value)}
                                className="w-full bg-transparent px-1 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-slate-700 text-xs"
                              >
                                <option value="lm">lm</option>
                                <option value="m2">m²</option>
                                <option value="ea">ea</option>
                                <option value="hrs">hrs</option>
                                <option value="rolls">rolls</option>
                                <option value="trip">trip</option>
                                <option value="sum">sum</option>
                                <option value="pack">pack</option>
                                <option value="kg">kg</option>
                              </select>
                            </td>

                            {/* Wastage % */}
                            {showWastageColumn && (
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={row.wastagePercent || 0}
                                  onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'wastagePercent', cellLabel: `G${rIdx+1}`, value: String(row.wastagePercent || 0) })}
                                  onChange={(e) => handleCellChange(row.id, 'wastagePercent', e.target.value)}
                                  className="w-full bg-transparent px-1 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-right text-slate-500 text-xs"
                                />
                              </td>
                            )}

                            {/* Unit Cost */}
                            {showCostColumns && (
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.unitCostNZD || 0}
                                  onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'unitCostNZD', cellLabel: `H${rIdx+1}`, value: String(row.unitCostNZD || 0) })}
                                  onChange={(e) => handleCellChange(row.id, 'unitCostNZD', e.target.value)}
                                  className="w-full bg-transparent px-1.5 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-right text-slate-600 text-xs"
                                />
                              </td>
                            )}

                            {/* Markup % */}
                            {showCostColumns && (
                              <td className="py-1 px-2 text-right">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={row.markupPercent || 0}
                                  onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'markupPercent', cellLabel: `I${rIdx+1}`, value: String(row.markupPercent || 0) })}
                                  onChange={(e) => handleCellChange(row.id, 'markupPercent', e.target.value)}
                                  className="w-full bg-transparent px-1.5 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-right text-slate-700 font-semibold text-xs"
                                />
                              </td>
                            )}

                            {/* Sell Rate */}
                            <td className="py-1 px-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={row.unitSellNZD || 0}
                                onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'unitSellNZD', cellLabel: `J${rIdx+1}`, value: String(row.unitSellNZD || 0) })}
                                onChange={(e) => handleCellChange(row.id, 'unitSellNZD', e.target.value)}
                                className="w-full bg-transparent px-1.5 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-right font-bold text-slate-900 text-xs"
                              />
                            </td>

                            {/* Line Total */}
                            <td className="py-1 px-3 text-right bg-slate-50 font-bold text-slate-900 text-xs">
                              {formatNZD(row.totalNZD)}
                            </td>

                            {/* Formula / Calc Notes */}
                            {showFormulaColumn && (
                              <td className="py-1 px-3">
                                <input
                                  type="text"
                                  placeholder="=Qty * Rate"
                                  value={row.formula || ''}
                                  onFocus={() => setSelectedCellInfo({ rowId: row.id, colKey: 'formula', cellLabel: `L${rIdx+1}`, value: row.formula || '' })}
                                  onChange={(e) => handleCellChange(row.id, 'formula', e.target.value)}
                                  className="w-full bg-transparent px-1.5 py-1 rounded hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-sky-600 focus:outline-none text-slate-500 font-mono text-[11px]"
                                />
                              </td>
                            )}

                            {/* Delete Action */}
                            <td className="py-1 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(row.id)}
                                className="p-1 text-slate-300 hover:text-rose-600 rounded cursor-pointer transition-colors"
                                title="Delete line row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                          );
                        })}

                        {sectionRows.length === 0 && (
                          <tr>
                            <td colSpan={13} className="py-4 text-center text-slate-400 text-xs font-sans">
                              No line items in this section. Click "+ Add Row" above to insert.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: CLIENT PROPOSAL PREVIEW (HOLISTIC SCOPE OF WORKS)                 */}
      {/* ========================================================================= */}
      {viewMode === 'client_portal' && (
        <ProposalPreview
          quote={activeQuote}
          project={projects?.find(p => p.id === activeQuote.projectId)}
          sections={sections}
          rows={rows}
          onAcceptQuote={(signatureName) => {
            const updated = {
              ...activeQuote,
              status: 'accepted' as const,
              clientSignature: signatureName,
              signedAt: new Date().toISOString()
            };
            onUpdateQuote(updated);
            showMatrixToast(`Quote ${activeQuote.quoteNumber} accepted & digitally executed!`, 'success');
          }}
          onUpdateQuote={(updated) => {
            onUpdateQuote(updated);
            showMatrixToast('Proposal updated successfully', 'success');
          }}
          onSwitchToMatrix={() => setViewMode('spreadsheet')}
          onOpenClientPortalQuote={onOpenClientPortalQuote}
          onOpenAIPolisher={() => setIsAIPolisherOpen(true)}
        />
      )}

      {/* PASTE FROM EXCEL MODAL */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                <h4 className="font-bold text-slate-900 text-sm">Paste Rows from Excel / CSV</h4>
              </div>
              <button onClick={() => setIsPasteModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600">
              Copy rows directly from your Microsoft Excel or Google Sheets workbook and paste them below:
            </p>

            <textarea
              rows={6}
              placeholder="e.g. Code [TAB] Description [TAB] Quantity [TAB] Unit [TAB] Cost [TAB] Sell"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              className="w-full p-2.5 font-mono text-xs border border-slate-300 rounded bg-slate-50 text-slate-900 focus:bg-white focus:outline-none"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-3 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessPastedText}
                className="px-4 py-1.5 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer transition-colors shadow-2xs"
              >
                Insert Rows into Matrix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAKEOFF IMPORT MODAL (Onsite Survey & Flashing Pins) */}
      {isTakeoffModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-xl w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-sky-600" />
                <h4 className="font-bold text-slate-900 text-sm">Import Takeoff into Estimating Matrix</h4>
              </div>
              <button 
                type="button"
                onClick={() => setIsTakeoffModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Project Picker */}
            <div>
              <label className="block font-medium text-slate-700 mb-1 text-[11px]">
                Source Project / Job:
              </label>
              <select
                value={selectedTakeoffProjectId}
                onChange={(e) => setSelectedTakeoffProjectId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.projectNumber} - {proj.title} ({proj.siteAddress})
                  </option>
                ))}
              </select>
            </div>

            {/* Option A: Site Survey Measures */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Ruler className="w-4 h-4 text-sky-600" />
                  <span>On-Site Survey Measurements</span>
                </div>
                {activeTakeoffProject?.siteSurvey?.lineItems?.length ? (
                  <span className="text-[11px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {activeTakeoffProject.siteSurvey.lineItems.length} lines measured ({activeTakeoffProject.siteSurvey.surveyNumber || 'SURV-01'})
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-slate-400">No survey record</span>
                )}
              </div>

              {activeTakeoffProject?.siteSurvey?.lineItems?.length ? (
                <>
                  <p className="text-slate-600 text-[11px]">
                    Import rafter pitch calculations ({activeTakeoffProject.siteSurvey.pitchDeg}° pitch) and true slope lineal measures recorded on site directly into Section 1 (Trays) and Section 2 (Flashings).
                  </p>
                  <div className="max-h-32 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded bg-white text-[11px]">
                    {(activeTakeoffProject.siteSurvey.lineItems || []).map(item => (
                      <div key={item.id} className="p-1.5 flex items-center justify-between">
                        <span className="font-medium text-slate-800">{item.title || item.name || 'Measured Line'}</span>
                        <span className="font-mono font-bold text-slate-700">
                          {(((item.slopeLengthMm || item.measuredLengthMm || item.lengthMm || 0) / 1000) * (item.count || 1)).toFixed(1)} lm
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleImportSurveyTakeoff}
                      className="px-3 py-1.5 font-bold text-xs text-white bg-sky-700 hover:bg-sky-800 rounded cursor-pointer transition-colors shadow-2xs flex items-center gap-1.5"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>Import {(activeTakeoffProject.siteSurvey.lineItems || []).length} Survey Measures</span>
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  No site survey measurements recorded yet for this project. Open the On-Site Tool or Survey tab to record field dimensions.
                </p>
              )}
            </div>

            {/* Option B: CAD Drawing Pins */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Compass className="w-4 h-4 text-sky-600" />
                  <span>Architectural Drawing Flashing Pins</span>
                </div>
                {activeTakeoffProject?.flashingPins?.length ? (
                  <span className="text-[11px] font-mono text-sky-700 font-bold bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    {activeTakeoffProject.flashingPins.length} pins placed
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-slate-400">No pins on plans</span>
                )}
              </div>

              {activeTakeoffProject?.flashingPins?.length ? (
                <>
                  <p className="text-slate-600 text-[11px]">
                    Import custom flashing profiles pinned onto Plan RC-01 drawings with pre-calculated girth tiers into Section 2 (Flashings).
                  </p>
                  <div className="max-h-28 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded bg-white text-[11px]">
                    {activeTakeoffProject.flashingPins.map(pin => (
                      <div key={pin.id} className="p-1.5 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-800">{pin.label}</span>
                          <span className="text-slate-500 ml-1">({pin.profileName})</span>
                        </div>
                        <span className="font-mono font-bold text-slate-700">
                          {(pin.lengthLm * (pin.quantity || 1)).toFixed(1)} lm ({pin.girthTier || '301-450mm'})
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleImportFlashingPinsTakeoff}
                      className="px-3 py-1.5 font-bold text-xs text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer transition-colors shadow-2xs flex items-center gap-1.5"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>Import {activeTakeoffProject.flashingPins.length} Drawing Pins</span>
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  No flashing pins marked up on drawings for this project. Use the Plan Markup Tool to place flashing pins.
                </p>
              )}
            </div>

            {/* Option C: Saved ApexMap™ Roof BOM */}
            <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Compass className="w-4 h-4 text-emerald-700" />
                  <span>Saved ApexMap™ Roof BOM &amp; Offcut Schedule</span>
                </div>
                {activeTakeoffProject?.roofPlanModel?.bom ? (
                  <span className="text-[11px] font-mono text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 tabular-nums">
                    {activeTakeoffProject.roofPlanModel.bom.totalRoofAreaM2} m² · {activeTakeoffProject.roofPlanModel.bom.totalSheetsCount} sheets
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-slate-500">No modeled roof saved</span>
                )}
              </div>

              {activeTakeoffProject?.roofPlanModel?.bom ? (
                <>
                  <p className="text-slate-600 text-[11px]">
                    Import ordered sheets ({(activeTakeoffProject.roofPlanModel.bom.totalOrderedLm ?? (activeTakeoffProject.roofPlanModel.bom as { totalSheetsLm?: number }).totalSheetsLm ?? 0).toFixed(1)} lm, {activeTakeoffProject.roofPlanModel.bom.wastePercent}% waste), flashing runs ({activeTakeoffProject.roofPlanModel.bom.totalFlashingLm} lm), fixings, underlay &amp; labour straight into this quote.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTakeoffModalOpen(false);
                        setIsApexStudioModalOpen(true);
                      }}
                      className="px-3 py-1.5 font-bold text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded cursor-pointer transition-colors"
                    >
                      Open in ApexMap™ Studio
                    </button>
                    <button
                      type="button"
                      onClick={handleImportSavedRoofBom}
                      className="px-3 py-1.5 font-bold text-xs text-white bg-emerald-700 hover:bg-emerald-800 rounded cursor-pointer transition-colors shadow-2xs flex items-center gap-1.5"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>Import Roof BOM</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-600">
                    Sketch this roof in ApexMap™ Studio to compute exact sheet lengths, offcuts, flashings, and hardware.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTakeoffModalOpen(false);
                      setIsApexStudioModalOpen(true);
                    }}
                    className="shrink-0 px-3 py-1.5 font-bold text-xs text-white bg-emerald-700 hover:bg-emerald-800 rounded cursor-pointer transition-colors"
                  >
                    Launch Studio
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsTakeoffModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MATRIX TOAST NOTIFICATION */}
      {matrixToast && (
        <div className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 shadow-xs ${
          matrixToast.type === 'success' 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium' 
            : matrixToast.type === 'error'
            ? 'bg-rose-50 border-rose-300 text-rose-950 font-medium'
            : 'bg-sky-50 border-sky-300 text-sky-950 font-medium'
        }`}>
          <div className="flex items-center gap-2">
            {matrixToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : matrixToast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Check className="w-4 h-4 text-sky-600 shrink-0" />
            )}
            <span>{matrixToast.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setMatrixToast(null)}
            className="text-slate-500 hover:text-slate-800 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* MODAL: CREATE NEW VERSION */}
      {isNewVersionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-100 uppercase">
                  Immutability & Version Control
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  Create Version {(activeQuote.version || 1) + 1}.0
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewVersionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              The existing version (<strong>{activeQuote.quoteNumber}</strong>) will be locked and marked <strong>Superseded</strong>. A fresh version will be created with its own 30-day validity window and complete audit trail.
            </p>

            <form onSubmit={handleCreateNewVersion} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Revision Reason / Scope Adjustment Notes *
                </label>
                <textarea
                  rows={3}
                  required
                  value={versionReason}
                  onChange={(e) => setVersionReason(e.target.value)}
                  placeholder="e.g. Switched to 0.55mm MagnaFlow Extreme and added ventilated ridge flashings per client request."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewVersionModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Issue Version {(activeQuote.version || 1) + 1}.0</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SWITCH PROFILE & MATERIAL (AUTO-RECALCULATE) */}
      {isSwitchSpecModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 uppercase">
                  Matrix Auto-Recalculate
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  Switch Specification (Keep Quantities)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSwitchSpecModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Select an alternative tray profile or coil coating. Archtech will preserve all takeoff dimensions ({activeQuote.roofAreaM2} m² area, flashing lengths), pull live rates from the Master Pricing Matrix ({catalogue.lastUpdatedDate}), and generate a new dated version.
            </p>

            <form onSubmit={handleExecuteSwitchProfileMaterial} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Target Profile</label>
                  <select
                    value={switchProfile}
                    onChange={(e) => setSwitchProfile(e.target.value as RoofingProfile)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-600 font-semibold"
                  >
                    <option value="Super Seam 38mm">Super Seam 38mm</option>
                    <option value="Snaplock 25mm">Snaplock 25mm</option>
                    <option value="Standing Seam 25mm">Standing Seam 25mm</option>
                    <option value="Interlocking Panel 300mm">Interlocking Panel 300mm</option>
                    <option value="Corrugate 760mm">Corrugate 760mm</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Target Material & Coating</label>
                  <select
                    value={switchMaterial}
                    onChange={(e) => setSwitchMaterial(e.target.value as CoilMaterial)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-600 font-semibold"
                  >
                    <option value="0.55mm MagnaFlow® Extreme">0.55mm MagnaFlow® Extreme</option>
                    <option value="0.55mm Vitor+® Marine">0.55mm Vitor+® Marine</option>
                    <option value="0.75mm Architectural Aluminium">0.75mm Architectural Aluminium</option>
                    <option value="0.6mm Pure Copper">0.6mm Pure Copper</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center justify-between font-mono">
                  <span>Current Spec:</span>
                  <span className="font-bold text-slate-800">{activeQuote.profile} · {activeQuote.material}</span>
                </div>
                <div className="flex items-center justify-between font-mono">
                  <span>Current Total:</span>
                  <span className="font-bold text-slate-800">{formatNZD(activeQuote.totalNZD)}</span>
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  * New total will be computed automatically using TRS coil base price and effective pan coverage.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSwitchSpecModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Generate New Matrix Version</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VERSION COMPARISON & DIFF */}
      {isCompareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-700">
                  <GitCompare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Quote Version & Specification Comparison
                  </h3>
                  <p className="text-xs text-slate-500">
                    Comparing active version <strong>{activeQuote.quoteNumber} (v{activeQuote.version || 1}.0)</strong> with previous revisions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCompareModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Compare against:</span>
                <select
                  value={compareTargetQuoteId || (quotes.find(q => q.id !== activeQuote.id)?.id || '')}
                  onChange={(e) => setCompareTargetQuoteId(e.target.value)}
                  className="bg-white border border-slate-300 text-slate-900 rounded-md px-2.5 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  {quotes.filter(q => q.id !== activeQuote.id).map(q => (
                    <option key={q.id} value={q.id}>
                      {q.quoteNumber} — {q.clientName} (v{q.version || 1}.0) [{q.status.toUpperCase()}] · {formatNZD(q.totalNZD)}
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const targetQ = quotes.find(q => q.id === (compareTargetQuoteId || quotes.find(o => o.id !== activeQuote.id)?.id));
                if (!targetQ) return null;
                const diff = compareQuoteVersions(activeQuote, targetQ);
                const isIncrease = diff.totalDiffNZD > 0;
                return (
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-500 text-[11px]">Base: {formatNZD(targetQ.totalNZD)}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-slate-900">Current: {formatNZD(activeQuote.totalNZD)}</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                      isIncrease ? 'bg-amber-100 text-amber-900' : diff.totalDiffNZD < 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {isIncrease ? '+' : ''}{formatNZD(diff.totalDiffNZD)} ({isIncrease ? '+' : ''}{diff.diffPercent}%)
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Diff Content Body */}
            {(() => {
              const targetQ = quotes.find(q => q.id === (compareTargetQuoteId || quotes.find(o => o.id !== activeQuote.id)?.id));
              if (!targetQ) {
                return (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No other quote version found to compare against. Create a new version first.
                  </div>
                );
              }

              const diff = compareQuoteVersions(activeQuote, targetQ);

              return (
                <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
                  {/* Specification Delta Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {diff.specChanges.map(sc => (
                      <div key={sc.label} className={`p-2.5 rounded-lg border ${
                        sc.changed ? 'bg-amber-50/70 border-amber-300' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="text-[10px] text-slate-500 font-mono uppercase">{sc.label}</div>
                        <div className="font-medium text-slate-700 truncate text-[11px] mt-0.5">
                          <span className="text-slate-400 line-through mr-1">{sc.from}</span>
                          <span className={sc.changed ? 'font-bold text-amber-900' : 'text-slate-800'}>{sc.to}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Line Item Diff Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs font-mono">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-2.5 w-20">Diff</th>
                          <th className="py-2 px-3 min-w-[200px] font-sans">Line Item / Specification</th>
                          <th className="py-2 px-2 text-right">Old Qty</th>
                          <th className="py-2 px-2 text-right">New Qty</th>
                          <th className="py-2 px-2 text-right">Old Rate</th>
                          <th className="py-2 px-2 text-right">New Rate</th>
                          <th className="py-2 px-3 text-right">Variance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {diff.lineItemDiffs.map((item) => (
                          <tr key={item.id} className={`hover:bg-slate-50/70 ${
                            item.status === 'added' ? 'bg-emerald-50/40' : item.status === 'removed' ? 'bg-rose-50/40' : item.status === 'modified' ? 'bg-amber-50/30' : ''
                          }`}>
                            <td className="py-1.5 px-2.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                item.status === 'added' 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : item.status === 'removed'
                                  ? 'bg-rose-100 text-rose-800'
                                  : item.status === 'modified'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 font-sans text-slate-800 font-medium text-xs">
                              {item.description}
                            </td>
                            <td className="py-1.5 px-2 text-right text-slate-500">
                              {item.qtyB !== undefined ? item.qtyB : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold text-slate-800">
                              {item.qtyA !== undefined ? item.qtyA : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right text-slate-500">
                              {item.rateB !== undefined ? formatNZD(item.rateB) : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold text-slate-800">
                              {item.rateA !== undefined ? formatNZD(item.rateA) : '—'}
                            </td>
                            <td className={`py-1.5 px-3 text-right font-bold ${
                              item.diffTotalNZD > 0 ? 'text-amber-700' : item.diffTotalNZD < 0 ? 'text-emerald-700' : 'text-slate-500'
                            }`}>
                              {item.diffTotalNZD > 0 ? '+' : ''}{formatNZD(item.diffTotalNZD)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCompareModalOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MARK AS ACCEPTED & LOCK CONTRACT */}
      {isAcceptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Formally Accept Quote
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeQuote.quoteNumber} · Total {formatNZD(activeQuote.totalNZD)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAcceptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Marking this quote as accepted legally locks the specification and contract total. Price matrix pushes will never affect an accepted quote.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleMarkAccepted(signerNameInput || activeQuote.clientName || 'Client Authoriser');
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Authorised Signer Name *
                </label>
                <input
                  type="text"
                  required
                  value={signerNameInput}
                  onChange={(e) => setSignerNameInput(e.target.value)}
                  placeholder="e.g. John Doe (Director / Homeowner)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAcceptModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Confirm Acceptance & Lock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MARK AS DECLINED */}
      {isDeclineModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-50 rounded-lg text-rose-700">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Mark Quote as Declined
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeQuote.quoteNumber} · {activeQuote.clientName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeclineModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleMarkDeclined(declineReasonInput);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Decline Reason / Feedback
                </label>
                <select
                  value={declineReasonInput}
                  onChange={(e) => setDeclineReasonInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-600 font-medium mb-2"
                >
                  <option value="Client requested scope revision">Client requested scope revision</option>
                  <option value="Budget constraints / Price too high">Budget constraints / Price too high</option>
                  <option value="Project postponed / Cancelled">Project postponed / Cancelled</option>
                  <option value="Competitor chosen">Competitor chosen</option>
                  <option value="Alternative material selected">Alternative material selected</option>
                </select>

                <textarea
                  rows={2}
                  value={declineReasonInput}
                  onChange={(e) => setDeclineReasonInput(e.target.value)}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-600 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDeclineModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Mark as Declined</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <OneDriveSyncModal
        isOpen={isOneDriveModalOpen}
        onClose={() => setIsOneDriveModalOpen(false)}
        activeQuote={activeQuote}
        onSyncQuote={(updated) => onUpdateQuote(updated)}
      />

      {/* SMART ENGINE MODALS */}
      <SmartTakeoffModal
        isOpen={isSmartTakeoffModalOpen}
        onClose={() => setIsSmartTakeoffModalOpen(false)}
        activeQuote={activeQuote}
        onApplyScope={handleApplySmartScope}
      />

      <SmartComplianceAuditorDrawer
        isOpen={isComplianceAuditorOpen}
        onClose={() => setIsComplianceAuditorOpen(false)}
        activeQuote={activeQuote}
        onApplyFixPatch={handleApplyFixPatch}
        onApplyAllFixes={handleApplyAllFixes}
      />

      <SmartProposalAIPolisherModal
        isOpen={isAIPolisherOpen}
        onClose={() => setIsAIPolisherOpen(false)}
        activeQuote={activeQuote}
        currentLetterText={coverLetterText}
        onApplyLetter={(newLetter) => {
          setCoverLetterText(newLetter);
          onUpdateQuote({
            ...activeQuote,
            proposalCoverLetter: newLetter
          });
          showMatrixToast('Applied AI executive cover letter to proposal!', 'success');
        }}
      />

      {isApexStudioModalOpen && (
        <div className="fixed inset-0 z-[70] bg-[#070b14] flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-[#0a101d] border-b border-slate-800 text-xs text-white shrink-0">
            <div className="flex items-center gap-2 font-bold">
              <Compass className="w-4 h-4 text-emerald-400" />
              <span>ApexMap™ Studio · Quoting Stage for {activeQuote.quoteNumber}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsApexStudioModalOpen(false)}
              className="min-h-9 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Back to Quote</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-2">
            <ExactRoofingHub
              project={activeTakeoffProject}
              projects={projects}
              activeQuote={activeQuote}
              quotes={quotes}
              initialStage="quoting"
              onSelectProject={(id) => setSelectedTakeoffProjectId(id)}
              onUpdateProject={onUpdateProject}
              onPushBomToQuote={handlePushBomFromApex}
              onSaveToProject={(_planes, _layout, _flashings, snapshot) => {
                if (activeTakeoffProject && onUpdateProject && snapshot) {
                  onUpdateProject({
                    ...activeTakeoffProject,
                    roofPlanModel: snapshot as any,
                    roofAreaM2: snapshot.bom?.totalRoofAreaM2 || activeTakeoffProject.roofAreaM2
                  });
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
