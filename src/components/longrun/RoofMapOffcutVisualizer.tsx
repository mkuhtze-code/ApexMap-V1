import React, { useState } from 'react';
import { 
  RoofFacet, 
  LongRunSheetItem, 
  LongRunProfileKey, 
  LONGRUN_PROFILES,
  RoofPlanModel,
  AIRoofOptimizationResult
} from '../../types/longrun';
import { Project, Quote, RoofingProfile, CoilMaterial } from '../../types/crm';
import {
  RoofPlane,
  LayoutResult,
  RoofFlashingAssignment,
  RoofLifecycleStage,
  RoofBomSummary,
  ExactRoofModelSnapshot
} from '../../types/exactRoofing';
import { analyzeRoofWithAI } from '../../utils/aiRoofAnalyzer';
import { convertExactLayoutToRoofFacets } from '../../utils/exactRoofingBomBridge';
import { ExactRoofingHub, ExactRoofingHubTab } from '../exactroofing/ExactRoofingHub';
import { 
  Bot,
  Wind, 
  Scissors,
  CheckCircle2, 
  RefreshCw,
  Sparkles,
  Info
} from 'lucide-react';

interface Props {
  project?: Project;
  projects?: Project[];
  quotes?: Quote[];
  activeQuote?: Quote;
  initialStage?: RoofLifecycleStage;
  onSelectProject?: (projectId: string) => void;
  facets: RoofFacet[];
  onUpdateFacets: (facets: RoofFacet[]) => void;
  profileKey: LongRunProfileKey;
  gauge: string;
  colorName: string;
  selectedSheetId?: string | null;
  onSelectSheet?: (sheet: LongRunSheetItem | null) => void;
  onSaveToProject?: (facets: RoofFacet[], planModel?: RoofPlanModel) => void;
  onUpdateProject?: (project: Project) => void;
  onPushBomToQuote?: (opts: {
    targetQuoteId: string | 'new';
    profile: RoofingProfile;
    material: CoilMaterial;
    colorName: string;
    markupPercent: number;
    includeHardware: boolean;
    includeUnderlay: boolean;
    includeLabourEstimate: boolean;
    replaceExistingSections: boolean;
    revisionKind: import('../../types/exactRoofing').EnvelopeRevisionKind;
    envelope: import('../../types/exactRoofing').EnvelopeSnapshot;
    bom: RoofBomSummary;
    snapshot: ExactRoofModelSnapshot;
    project?: Project;
    stillCaptureFailed?: boolean;
  }) => void;
  activeMemberName?: string;
  embedded?: boolean;
  initialTab?: ExactRoofingHubTab;
  initialWorkshopView?: 'library' | 'orders';
  onOpenFlashingOrders?: () => void;
  isManagerView?: boolean;
}

export const RoofMapOffcutVisualizer: React.FC<Props> = ({
  project,
  projects = [],
  quotes = [],
  activeQuote,
  initialStage,
  onSelectProject,
  facets,
  onUpdateFacets,
  profileKey,
  gauge,
  colorName,
  onSaveToProject,
  onUpdateProject,
  onPushBomToQuote,
  activeMemberName,
  embedded = true,
  initialTab = 'canvas_plan',
  initialWorkshopView = 'library',
  onOpenFlashingOrders,
  isManagerView = false
}) => {
  const [prevailingWind, setPrevailingWind] = useState<'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'>('SW');
  const [showAiDrawer, setShowAiDrawer] = useState<boolean>(false);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AIRoofOptimizationResult | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Run AI roof intelligence analysis
  const handleRunAiAnalysis = async () => {
    setIsAiLoading(true);
    setShowAiDrawer(true);
    try {
      const targetProj = project || ({
        id: 'proj-1',
        projectNumber: 'NZ-ROOF-2026',
        title: 'Long-Run Residential Project',
        clientName: 'Homeowner',
        siteAddress: '14 Karaka Street, Auckland',
        scopeDescription: 'Long-run roofing with offcut optimization',
        totalContractNZD: 32000,
        jobStage: 'active_onsite',
        status: 'in_progress',
        progressPercent: 45
      } as unknown as Project);

      const result = await analyzeRoofWithAI(
        targetProj,
        facets,
        profileKey,
        gauge,
        colorName,
        prevailingWind
      );
      setAiResult(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Sync Exact Roofing planes, BOM, packs & layout to CRM project
  const handleSaveExactRoofingToProject = (
    planes: RoofPlane[],
    layout?: LayoutResult,
    flashingAssignments?: RoofFlashingAssignment[],
    snapshot?: ExactRoofModelSnapshot
  ) => {
    const convertedFacets =
      planes.length > 0
        ? convertExactLayoutToRoofFacets({
            planes,
            layout: layout || null,
            profileKey,
            gauge: gauge === '0.40mm' ? '0.40mm' : '0.55mm',
            colorName
          })
        : facets;

    const planModel: RoofPlanModel = {
      id: project?.roofPlanModel?.id || `plan-${project?.id || 'main'}-${Date.now()}`,
      projectId: project?.id || 'proj-1',
      projectNumber: project?.projectNumber || 'ROOF-2026',
      roofArchetype: 'hip_and_valley',
      overallBuildingLengthMm: 14000,
      overallBuildingWidthMm: 10000,
      pitchDegrees: planes[0]?.pitchDeg || 22.5,
      prevailingWind,
      ...(snapshot || {}),
      facets: convertedFacets,
      planes,
      layout,
      flashingAssignments,
      aiIntelligence: aiResult || undefined,
      lastUpdated: new Date().toISOString(),
      updatedBy: activeMemberName || 'Lead LBP / Estimator'
    } as RoofPlanModel;

    onUpdateFacets(convertedFacets);
    onSaveToProject?.(convertedFacets, planModel);
    setSaveSuccessNotice('Roof outline, offcut BOM, packs & stage saved to project');
    setTimeout(() => setSaveSuccessNotice(null), 3500);
  };

  return (
    <div className={embedded ? 'space-y-3' : 'flex flex-col flex-1 min-h-0 h-full gap-3'}>
      {/* Toast Notice */}
      {saveSuccessNotice && (
        <div className="bg-emerald-950 text-emerald-200 border border-emerald-700 p-3 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveSuccessNotice}</span>
        </div>
      )}

      {/* Optional AI Wind Audit Floating Drawer */}
      {showAiDrawer && (
        <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 border border-purple-500/40 shadow-xl space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-purple-800/40 pb-2.5">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              <h4 className="text-sm font-bold text-white">
                ApexMap™ AI Roof Laying &amp; Wind Vortex Audit
              </h4>
            </div>
            <button
              onClick={() => setShowAiDrawer(false)}
              className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          {isAiLoading ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs text-purple-300">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
              <span>Analyzing roof geometry, NZ wind zones (NZS 3604), and section offcut flow...</span>
            </div>
          ) : aiResult ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-purple-900/30 border border-purple-500/30 space-y-1">
                  <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5 text-purple-400" />
                    Ideal Laying Direction (NZMRM Compliance)
                  </div>
                  <div className="text-sm font-extrabold text-white">
                    {aiResult.idealLayingDirection}
                  </div>
                  <p className="text-[11px] text-purple-200 leading-relaxed pt-0.5">
                    {aiResult.prevailingWindRationale}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-indigo-900/30 border border-indigo-500/30 space-y-1">
                  <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-indigo-400" />
                    Offcut Harvesting &amp; Steel Recovery
                  </div>
                  <div className="text-sm font-extrabold text-emerald-400">
                    +{aiResult.estimatedSteelSavedLm} lm Steel Saved (${aiResult.estimatedDollarSavedNZD} NZD)
                  </div>
                  <p className="text-[11px] text-indigo-200 pt-0.5">
                    Section offcuts systematically harvested from hip faces into valleys.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* CONSOLIDATED PRIMARY WORKSPACE: EXACT ROOFING + FLASHING WORKSHOP INSIDE APEXMAP */}
      <ExactRoofingHub
        project={project}
        projects={projects}
        quotes={quotes}
        activeQuote={activeQuote}
        initialStage={
          initialStage ||
          project?.roofPlanModel?.stage ||
          (project?.roofPlanModel?.measureLocked ? 'installing' : 'measuring')
        }
        onSelectProject={onSelectProject}
        activeMemberName={activeMemberName}
        embedded={embedded}
        initialTab={initialTab}
        initialWorkshopView={initialWorkshopView}
        onUpdateProject={onUpdateProject}
        onPushBomToQuote={onPushBomToQuote}
        onOpenFlashingOrders={onOpenFlashingOrders}
        onSaveToProject={handleSaveExactRoofingToProject}
      />
    </div>
  );
};
