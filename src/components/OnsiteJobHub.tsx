import React, { useState, useMemo, useEffect } from 'react';
import {
  Project,
  TeamMember,
  SiteTask,
  SitePhoto,
  OnsiteMaterialOrder,
  ArchitecturalPlan,
  SiteScheduleEvent,
  AccessLayer,
  SiteMeasureRecord,
  SiteMeasureLineItem,
  SiteVisitInspection,
  JobChecklistItem,
  SnaggingItem,
  ActivityLogItem
} from '../types/crm';

import {
  MapPin,
  Phone,
  Mail,
  Building,
  Users,
  CheckSquare,
  Square,
  Plus,
  FileText,
  Camera,
  ShoppingCart,
  Calendar,
  ChevronRight,
  Layers,
  Ruler,
  AlertTriangle,
  Settings2,
  X,
  Image as ImageIcon,
  ExternalLink,
  ClipboardList,
  Pencil,
  ShieldCheck,
  CheckCircle2,
  Printer,
  Download,
  Clock,
  Wind,
  Droplets,
  Share2,
  Check,
  Compass,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Sliders,
  Filter,
  Scissors
} from 'lucide-react';
import { FlashingWorkshop } from './FlashingWorkshop';
import { PlanMarkupTool } from './PlanMarkupTool';
import { calculateSlopeDistanceMm } from '../utils/planGeometry';
import { ARCHITECTURAL_FLASHING_PRESETS } from '../utils/sheetMetalGeometry';
import { formatDate, formatTimeAgo } from '../utils/formatters';

// Specialized Long-Run Roofing Modules
import { RoofMapOffcutVisualizer } from './longrun/RoofMapOffcutVisualizer';
import { LongRunSheetOrder } from './longrun/LongRunSheetOrder';
import { LongRunFlashingOrder } from './longrun/LongRunFlashingOrder';
import { LongRunCutLists } from './longrun/LongRunCutLists';
import { generateInitialLongRunData, calculateOffcutStats } from '../utils/longRunRoofEngine';
import {
  RoofFacet,
  LongRunFlashingItem,
  LongRunProfileKey,
  LongRunSheetItem
} from '../types/longrun';

interface Props {
  projects: Project[];
  onUpdateProject: (project: Project) => void;
  initialProjectId?: string;
  teamMembers?: TeamMember[];
  inspections?: SiteVisitInspection[];
  onAddInspection?: (inspection: SiteVisitInspection) => void;
  onOpenAdvanced?: (projectId: string) => void;
}

type HubSection = 
  | 'roof_map' 
  | 'order_sheets' 
  | 'order_flashings' 
  | 'cut_lists' 
  | 'home' 
  | 'survey' 
  | 'flashings' 
  | 'files' 
  | 'qa' 
  | 'tasks' 
  | 'orders' 
  | 'photos';

type QuickCaptureType = 'photo' | 'measure' | 'daily_tally' | 'snag' | 'time' | 'order' | 'qa';

function resolveAccessLayer(member?: TeamMember): AccessLayer {
  if (member?.accessLayer) return member.accessLayer;
  if (!member) return 'standard';
  if (member.authority?.canSignPS3 || member.authority?.canEditAuthorities) return 'full';
  if (member.authority?.canOrderMaterials || member.authority?.canLogMeasures) return 'standard';
  if (member.role === 'Project Coordinator') return 'office';
  return 'light';
}

export const OnsiteJobHub: React.FC<Props> = ({
  projects,
  onUpdateProject,
  initialProjectId,
  teamMembers = [],
  inspections = [],
  onAddInspection,
  onOpenAdvanced
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId || projects[0]?.id || ''
  );
  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  const [activeMemberId, setActiveMemberId] = useState(
    teamMembers[0]?.id || ''
  );
  const activeMember =
    teamMembers.find((m) => m.id === activeMemberId) || teamMembers[0] || {
      id: 'team-1',
      name: 'Marcus Kuhtze',
      role: 'Managing Director (LBP)',
      accessLayer: 'full' as AccessLayer,
      lbpNumber: 'BP134821',
      phone: '+64 21 849 201',
      email: 'marcus@archtech.co.nz',
      authority: {
        canSignPS3: true,
        canApproveMilestones: true,
        canOrderMaterials: true,
        canConductSiteMeetings: true,
        canLogMeasures: true,
        canManageSnagging: true,
        canEditAuthorities: true
      }
    };
  const accessLayer = resolveAccessLayer(activeMember);

  // Prioritize Roof Map & Long-Run Suite by default
  const [section, setSection] = useState<HubSection>('roof_map');
  const [isSiteBriefExpanded, setIsSiteBriefExpanded] = useState<boolean>(false);
  const [activeCaptureModal, setActiveCaptureModal] = useState<QuickCaptureType | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [flashingView, setFlashingView] = useState<'library' | 'orders'>('library');
  const [selectedPlanForMarkup, setSelectedPlanForMarkup] = useState<ArchitecturalPlan | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'photos' | 'measures' | 'snags' | 'logs'>('all');
  const [showPs3Preview, setShowPs3Preview] = useState(false);

  const isOrdersSection = section === 'order_sheets' || section === 'order_flashings' || section === 'cut_lists';
  const isFieldSection = section === 'home' || section === 'survey' || section === 'files' || section === 'qa' || section === 'tasks' || section === 'orders' || section === 'photos';

  // -------------------------------------------------------------------
  // DEDICATED LONGRUN ROOFING SUITE STATE
  // -------------------------------------------------------------------
  const [longRunFacets, setLongRunFacets] = useState<RoofFacet[]>(() => {
    try {
      const saved = localStorage.getItem(`archtech_lr_facets_${selectedProject?.id}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return generateInitialLongRunData(selectedProject).facets;
  });

  const [longRunFlashings, setLongRunFlashings] = useState<LongRunFlashingItem[]>(() => {
    try {
      const saved = localStorage.getItem(`archtech_lr_flashings_${selectedProject?.id}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return generateInitialLongRunData(selectedProject).flashings;
  });

  const [longRunProfileKey, setLongRunProfileKey] = useState<LongRunProfileKey>(() => {
    return generateInitialLongRunData(selectedProject).profileKey;
  });

  const [longRunGauge, setLongRunGauge] = useState<'0.40mm' | '0.55mm'>(() => {
    return generateInitialLongRunData(selectedProject).gauge;
  });

  const [longRunColor, setLongRunColor] = useState<string>(() => {
    return selectedProject?.colorName || 'FlaxPod';
  });

  // Keep longrun state synchronized when user changes project
  useEffect(() => {
    if (!selectedProject?.id) return;
    try {
      if (selectedProject.roofMapFacets && selectedProject.roofMapFacets.length > 0) {
        setLongRunFacets(selectedProject.roofMapFacets);
      } else {
        const savedF = localStorage.getItem(`archtech_lr_facets_${selectedProject.id}`);
        if (savedF) {
          setLongRunFacets(JSON.parse(savedF));
        } else {
          const init = generateInitialLongRunData(selectedProject);
          setLongRunFacets(init.facets);
          setLongRunProfileKey(init.profileKey);
          setLongRunGauge(init.gauge);
          setLongRunColor(init.colorName);
        }
      }

      const savedFl = localStorage.getItem(`archtech_lr_flashings_${selectedProject.id}`);
      if (savedFl) {
        setLongRunFlashings(JSON.parse(savedFl));
      } else {
        setLongRunFlashings(generateInitialLongRunData(selectedProject).flashings);
      }
    } catch {}
  }, [selectedProject?.id, selectedProject?.roofMapFacets]);

  // Persist long-run facets to localStorage
  useEffect(() => {
    if (selectedProject?.id && longRunFacets.length > 0) {
      try {
        localStorage.setItem(`archtech_lr_facets_${selectedProject.id}`, JSON.stringify(longRunFacets));
      } catch {}
    }
  }, [longRunFacets, selectedProject?.id]);

  // Persist long-run flashings to localStorage
  useEffect(() => {
    if (selectedProject?.id && longRunFlashings.length > 0) {
      try {
        localStorage.setItem(`archtech_lr_flashings_${selectedProject.id}`, JSON.stringify(longRunFlashings));
      } catch {}
    }
  }, [longRunFlashings, selectedProject?.id]);

  const longRunStats = useMemo(() => calculateOffcutStats(longRunFacets), [longRunFacets]);

  const handleDispatchLongRunOrder = (order: OnsiteMaterialOrder) => {
    const newActivity: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'material_order',
      title: `Roll-former Order Placed: ${order.orderNumber}`,
      details: `${order.items.map((i) => `${i.quantity} ${i.unit} ${i.itemDescription}`).join(', ')}. Supplier: ${order.supplier}.`,
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    const updatedProject: Project = {
      ...selectedProject,
      materialOrders: [order, ...(selectedProject.materialOrders || [])],
      activityFeed: [newActivity, ...(selectedProject.activityFeed || [])]
    };

    onUpdateProject(updatedProject);
    triggerNotice(`Order #${order.orderNumber} placed with ${order.supplier}`);
  };

  // Quick Action Form States
  // 1. Photo
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPhase, setPhotoPhase] = useState<'Tear-Off' | 'Substrate' | 'Underlay' | 'Trays' | 'Flashings' | 'QA' | 'Variation'>('Trays');
  const [photoPublishToPortal, setPhotoPublishToPortal] = useState(true);

  // 2. Measure & Pitch
  const [calcRunMm, setCalcRunMm] = useState<number>(6000);
  const [calcPitchDeg, setCalcPitchDeg] = useState<number>(15);
  const [measureCategory, setMeasureCategory] = useState<SiteMeasureLineItem['category']>('Barge');
  const [measureRef, setMeasureRef] = useState<string>('');
  const [measurePresetId, setMeasurePresetId] = useState<string>('f-barge-roll');
  const [measureNotes, setMeasureNotes] = useState<string>('');

  // 3. Daily Tally
  const [tallyTraysCount, setTallyTraysCount] = useState<number>(24);
  const [tallyLm, setTallyLm] = useState<number>(180);
  const [tallySeamingPercent, setTallySeamingPercent] = useState<number>(65);
  const [tallyCrewCount, setTallyCrewCount] = useState<number>(3);
  const [tallyNotes, setTallyNotes] = useState<string>('');

  // 4. Snag / Blocker
  const [snagTitle, setSnagTitle] = useState('');
  const [snagLocation, setSnagLocation] = useState('North Parapet Junction');
  const [snagSeverity, setSnagSeverity] = useState<SnaggingItem['severity']>('Moderate (Aesthetic / Flashing)');
  const [snagAssignee, setSnagAssignee] = useState(teamMembers[1]?.name || 'Tane Williams');

  // 5. Time Logger
  const [timeHours, setTimeHours] = useState<number>(4);
  const [timePhase, setTimePhase] = useState<string>('Tray Installation');
  const [timeWorker, setTimeWorker] = useState<string>(activeMember.name);
  const [timeNotes, setTimeNotes] = useState<string>('');

  // 6. Express Order
  const [orderSupplier, setOrderSupplier] = useState<OnsiteMaterialOrder['supplier']>('The Roofing Store (Albany)');
  const [orderUrgency, setOrderUrgency] = useState<OnsiteMaterialOrder['urgency']>('Urgent Same-Day HIAB');
  const [orderItemDesc, setOrderItemDesc] = useState('');
  const [orderItemQty, setOrderItemQty] = useState(250);
  const [orderItemUnit, setOrderItemUnit] = useState('pcs');

  // 7. Inline Quick Note
  const [quickNoteText, setQuickNoteText] = useState('');

  // Initial site survey state with local draft recovery
  const [surveyRecord, setSurveyRecord] = useState<SiteMeasureRecord>(() => {
    const projAny = selectedProject as Project & { siteSurvey?: SiteMeasureRecord };
    if (projAny?.siteSurvey) return projAny.siteSurvey;
    try {
      const saved = localStorage.getItem(`archtech_survey_${selectedProject?.id}`);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      id: `survey-${selectedProject.id}`,
      projectId: selectedProject.id,
      date: new Date().toISOString().split('T')[0],
      surveyor: activeMember?.name || 'Marcus Kuhtze (LBP BP134821)',
      status: 'approved',
      weatherConditions: 'Fine, 19°C, Wind NW 18 km/h (WorkSafe Compliant)',
      substrateChecklist: {
        timberMoisturePercent: 14.5,
        moistureCompliant: true,
        substrateType: '17mm CD Structural Plywood',
        expansionGapsChecked: true,
        underlayTapedLapsChecked: true,
        ventilationCavityChecked: true,
        notes: 'Substrate laid staggered with 3-4mm expansion gaps. Moisture 14.5% is under 18% limit conforming to NZBC E2/AS1 Table 7.'
      },
      lineItems: [
        {
          id: 'ml-01',
          category: 'Ridge',
          reference: 'Main Ridge Apex (Grid 1 to 5)',
          measuredLengthMm: 14200,
          planLengthMm: 14000,
          pitchDegrees: 15,
          method: 'laser',
          linkedFlashingPresetId: 'f-ventilated-ridge',
          notes: 'Allow 200mm overlap for gable barge intersection'
        },
        {
          id: 'ml-02',
          category: 'Barge',
          reference: 'North Gable Barge (True Rake)',
          measuredLengthMm: 6850,
          planLengthMm: 6610,
          pitchDegrees: 15,
          method: 'laser',
          linkedFlashingPresetId: 'f-barge-roll',
          notes: 'True raking slope length (15° multiplier 1.0353x)'
        },
        {
          id: 'ml-03',
          category: 'Apron',
          reference: 'Upper Storey Abutment High Wall',
          measuredLengthMm: 8400,
          planLengthMm: 8400,
          pitchDegrees: 15,
          method: 'tape',
          linkedFlashingPresetId: 'f-apron-e2as1',
          notes: 'Cladding kick-out 85mm clearance above pans verified'
        },
        {
          id: 'ml-04',
          category: 'Parapet',
          reference: 'East Parapet Capping',
          measuredLengthMm: 18600,
          planLengthMm: 18500,
          pitchDegrees: 5,
          method: 'laser',
          linkedFlashingPresetId: 'f-parapet-capping',
          notes: '5° slope inwards to roof pan drainage'
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });

  // Keep survey synchronized when project changes
  useEffect(() => {
    const projAny = selectedProject as Project & { siteSurvey?: SiteMeasureRecord };
    if (projAny?.siteSurvey) {
      setSurveyRecord(projAny.siteSurvey);
    } else {
      try {
        const saved = localStorage.getItem(`archtech_survey_${selectedProject?.id}`);
        if (saved) {
          setSurveyRecord(JSON.parse(saved));
        }
      } catch {
        // ignore
      }
    }
  }, [selectedProject?.id]);

  // Offline draft persistence
  useEffect(() => {
    if (selectedProject?.id && surveyRecord) {
      try {
        localStorage.setItem(`archtech_survey_${selectedProject.id}`, JSON.stringify(surveyRecord));
      } catch {
        // ignore storage errors
      }
    }
  }, [surveyRecord, selectedProject?.id]);

  const triggerNotice = (msg: string) => {
    setSyncNotice(msg);
    setTimeout(() => setSyncNotice(null), 3500);
  };

  // Derived tasks, orders, plans, photos
  const tasks: SiteTask[] = useMemo(() => {
    const anyProj = selectedProject as Project & { siteTasks?: SiteTask[] };
    return anyProj?.siteTasks || [];
  }, [selectedProject]);

  const schedule: SiteScheduleEvent[] = selectedProject?.fieldSchedule?.slice(0, 5) || [];
  const orders: OnsiteMaterialOrder[] = selectedProject?.materialOrders || [];
  const plans: ArchitecturalPlan[] = selectedProject?.architecturalPlans || selectedProject?.plans || [];
  const photos: SitePhoto[] = selectedProject?.sitePhotos || selectedProject?.photos || [];
  const snags: SnaggingItem[] = selectedProject?.snaggingItems || [];
  const openSnags = snags.filter((s) => s.status !== 'Resolved & Verified');
  const activityFeed: ActivityLogItem[] = selectedProject?.activityFeed || [];

  // Filtered Activity Stream
  const filteredFeed = useMemo(() => {
    if (feedFilter === 'all') return activityFeed;
    if (feedFilter === 'photos') return activityFeed.filter((i) => i.type === 'site_visit' && (i.details.includes('Photo') || i.title.includes('Photo')));
    if (feedFilter === 'measures') return activityFeed.filter((i) => i.title.toLowerCase().includes('measure') || i.details.toLowerCase().includes('slope') || i.details.toLowerCase().includes('lineal'));
    if (feedFilter === 'snags') return activityFeed.filter((i) => i.title.toLowerCase().includes('snag') || i.title.toLowerCase().includes('blocker') || i.details.toLowerCase().includes('defect'));
    if (feedFilter === 'logs') return activityFeed.filter((i) => i.type === 'time_logged' || i.title.toLowerCase().includes('work') || i.title.toLowerCase().includes('tally'));
    return activityFeed;
  }, [activityFeed, feedFilter]);

  // -------------------------------------------------------------------
  // ACTION HANDLERS
  // -------------------------------------------------------------------

  // 1. Save Photo
  const handleSavePhoto = () => {
    const defaultPlaceholderUrl =
      photoPhase === 'Tear-Off'
        ? 'https://images.unsplash.com/photo-1541888946425-d0fbb186156f?auto=format&fit=crop&w=800&q=80'
        : photoPhase === 'Substrate'
        ? 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80'
        : photoPhase === 'Flashings'
        ? 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80'
        : 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=800&q=80';

    const finalUrl = photoUrl.trim() || defaultPlaceholderUrl;
    const newPhoto: SitePhoto = {
      id: `photo-${Date.now()}`,
      url: finalUrl,
      caption: photoCaption.trim() || `${photoPhase} on ${selectedProject.title}`,
      phase: photoPhase,
      takenAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      uploadedBy: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
      author: activeMember.name,
      isPublicToClient: photoPublishToPortal
    };

    const newActivity: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'site_visit',
      title: `Photo: ${photoPhase}`,
      details: `${newPhoto.caption} ${photoPublishToPortal ? '(Shared with Client Portal)' : '(Internal QA)'}. Captured by ${activeMember.name}.`,
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    const updatedProject: Project = {
      ...selectedProject,
      sitePhotos: [newPhoto, ...(selectedProject.sitePhotos || [])],
      activityFeed: [newActivity, ...(selectedProject.activityFeed || [])]
    };

    onUpdateProject(updatedProject);
    setPhotoCaption('');
    setPhotoUrl('');
    setActiveCaptureModal(null);
    triggerNotice(`Photo uploaded and ${photoPublishToPortal ? 'published to Client Portal' : 'saved to internal QA'}`);
  };

  // 2. Save Laser Measure
  const handleSaveMeasure = () => {
    const calc = calculateSlopeDistanceMm(calcRunMm, calcPitchDeg);
    const lengthMm = calc.slopeMm;
    const ref = measureRef.trim() || `${measureCategory} Run (${calcPitchDeg}°)`;

    const newLine: SiteMeasureLineItem = {
      id: `meas-${Date.now()}`,
      category: measureCategory,
      reference: ref,
      measuredLengthMm: lengthMm,
      planLengthMm: lengthMm,
      pitchDegrees: calcPitchDeg,
      method: 'laser',
      linkedFlashingPresetId: measurePresetId,
      notes: measureNotes.trim()
    };

    const nextSurvey: SiteMeasureRecord = {
      ...surveyRecord,
      lineItems: [...(surveyRecord.lineItems || []), newLine],
      updatedAt: new Date().toISOString()
    };

    const newActivity: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'site_visit',
      title: `Laser Measure: ${ref}`,
      details: `${lengthMm}mm true slope (${calcPitchDeg}° pitch from ${calcRunMm}mm run). Logged by ${activeMember.name}.`,
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    setSurveyRecord(nextSurvey);
    const anyProj = selectedProject as Project & { siteSurvey?: SiteMeasureRecord };
    onUpdateProject({
      ...anyProj,
      siteSurvey: nextSurvey,
      activityFeed: [newActivity, ...(selectedProject.activityFeed || [])]
    });

    setMeasureRef('');
    setMeasureNotes('');
    setActiveCaptureModal(null);
    triggerNotice(`Measure ${ref} (${lengthMm}mm) saved to register`);
  };

  // 3. Save Daily Progress Tally
  const handleSaveDailyTally = () => {
    const currentProgress = selectedProject.progressPercent || 0;
    // Boost progress sensibly based on work done (e.g. +5% to 15% capped at 100%)
    const incrementalBoost = Math.min(100, Math.round(currentProgress + (tallyTraysCount > 30 ? 12 : 8)));

    const newLogItem: ActivityLogItem = {
      id: `log-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'time_logged',
      title: `Daily Work Done: ${tallyTraysCount} trays (${tallyLm} lm)`,
      details: `${tallyTraysCount} trays laid (${tallyLm} lineal metres). Double seaming progress at ${tallySeamingPercent}%. Crew on site: ${tallyCrewCount}. Notes: ${tallyNotes || 'Clean alignment, weather compliant.'}`,
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    const updatedProject: Project = {
      ...selectedProject,
      progressPercent: incrementalBoost,
      activityFeed: [newLogItem, ...(selectedProject.activityFeed || [])]
    };

    onUpdateProject(updatedProject);
    setTallyNotes('');
    setActiveCaptureModal(null);
    triggerNotice(`Daily progress recorded (${incrementalBoost}% complete)`);
  };

  // 4. Save Snag / Blocker
  const handleSaveSnag = () => {
    if (!snagTitle.trim()) return;

    const newSnag: SnaggingItem = {
      id: `snag-${Date.now()}`,
      projectId: selectedProject.id,
      title: snagTitle.trim(),
      location: snagLocation,
      severity: snagSeverity as any,
      reportedBy: activeMember.name,
      assignedTo: snagAssignee,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'Open',
      notes: `Identified during site visit by ${activeMember.name}`
    };

    const newActivity: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'site_visit',
      title: `Blocker: ${newSnag.title}`,
      details: `${newSnag.severity} at ${newSnag.location}. Assigned to ${newSnag.assignedTo}.`,
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    const updatedProject: Project = {
      ...selectedProject,
      snaggingItems: [newSnag, ...(selectedProject.snaggingItems || [])],
      activityFeed: [newActivity, ...(selectedProject.activityFeed || [])]
    };

    onUpdateProject(updatedProject);
    setSnagTitle('');
    setActiveCaptureModal(null);
    triggerNotice(`Issue recorded on punchlist for ${snagAssignee}`);
  };

  // 5. Save Time Log
  const handleSaveTime = () => {
    const newLogItem: ActivityLogItem = {
      id: `time-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'time_logged',
      title: `Labour: ${timeHours}h on ${timePhase}`,
      details: `${timeWorker} logged ${timeHours} hours on ${timePhase}. Notes: ${timeNotes || 'Standard site shift'}.`,
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    const updatedProject: Project = {
      ...selectedProject,
      activityFeed: [newLogItem, ...(selectedProject.activityFeed || [])]
    };

    onUpdateProject(updatedProject);
    setTimeNotes('');
    setActiveCaptureModal(null);
    triggerNotice(`Logged ${timeHours}h labour for ${timeWorker}`);
  };

  // 6. Save Express Order
  const handleSaveExpressOrder = () => {
    if (!orderItemDesc.trim()) return;

    const orderNum = `TRS-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrder: OnsiteMaterialOrder = {
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      projectId: selectedProject.id,
      projectNumber: selectedProject.projectNumber,
      orderedBy: activeMember.name,
      supplier: orderSupplier,
      orderDate: new Date().toISOString().slice(0, 10),
      urgency: orderUrgency,
      items: [
        {
          id: `item-${Date.now()}`,
          itemDescription: orderItemDesc.trim(),
          category: 'Fixings & Metal',
          quantity: orderItemQty,
          unit: orderItemUnit,
          urgencyReason: 'Onsite urgent need'
        }
      ],
      deliverySiteAddress: selectedProject.siteAddress,
      status: 'Sent to The Roofing Store',
      deliveryEta: orderUrgency === 'Urgent Same-Day HIAB' ? 'Today ~2:30 PM' : 'Tomorrow 07:30 AM'
    };

    const newActivity: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'material_order',
      title: `Express Order: ${orderItemDesc}`,
      details: `${orderItemQty} ${orderItemUnit} from ${orderSupplier} (${orderUrgency}). Dispatched by ${activeMember.name}.`,
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    const updatedProject: Project = {
      ...selectedProject,
      materialOrders: [newOrder, ...(selectedProject.materialOrders || [])],
      activityFeed: [newActivity, ...(selectedProject.activityFeed || [])]
    };

    onUpdateProject(updatedProject);
    setOrderItemDesc('');
    setActiveCaptureModal(null);
    triggerNotice(`Express Order #${orderNum} placed with ${orderSupplier}`);
  };

  // 7. Save Quick Note
  const handleSaveQuickNote = () => {
    if (!quickNoteText.trim()) return;

    const newLogItem: ActivityLogItem = {
      id: `note-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'note',
      title: 'Site Field Note',
      details: quickNoteText.trim(),
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    const updatedProject: Project = {
      ...selectedProject,
      activityFeed: [newLogItem, ...(selectedProject.activityFeed || [])]
    };

    onUpdateProject(updatedProject);
    setQuickNoteText('');
    triggerNotice('Field note posted to project stream');
  };

  // Resolve a Snag
  const handleToggleSnagStatus = (snagId: string) => {
    const updated = (selectedProject.snaggingItems || []).map((s) => {
      if (s.id === snagId) {
        const isNowResolved = s.status !== 'Resolved & Verified';
        return {
          ...s,
          status: (isNowResolved ? 'Resolved & Verified' : 'Open') as SnaggingItem['status'],
          resolvedAt: isNowResolved ? new Date().toISOString().replace('T', ' ').slice(0, 16) : undefined
        };
      }
      return s;
    });

    const target = selectedProject.snaggingItems?.find((s) => s.id === snagId);
    const newActivity: ActivityLogItem = {
      id: `act-${Date.now()}`,
      entityId: selectedProject.id,
      entityType: 'project',
      type: 'site_visit',
      title: `Resolved: ${target?.title || 'Snag item'}`,
      details: `Verified and marked resolved by ${activeMember.name}.`,
      author: activeMember.name,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    onUpdateProject({
      ...selectedProject,
      snaggingItems: updated,
      activityFeed: [newActivity, ...(selectedProject.activityFeed || [])]
    });
    triggerNotice('Punchlist item resolved and verified');
  };

  // Toggle Photo Client Portal Visibility
  const handleTogglePhotoVisibility = (photoId: string) => {
    const updatedPhotos = (selectedProject.sitePhotos || []).map((ph) => {
      if (ph.id === photoId) {
        const next = !ph.isPublicToClient;
        return { ...ph, isPublicToClient: next };
      }
      return ph;
    });
    onUpdateProject({
      ...selectedProject,
      sitePhotos: updatedPhotos
    });
    triggerNotice('Client portal photo visibility updated');
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        No active projects found.
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-7xl mx-auto space-y-3 px-2.5 sm:px-6 pt-2.5 pb-24 md:pb-10">
      {/* Toast Notice */}
      {syncNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 border border-slate-700 animate-in fade-in slide-in-from-top-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1 truncate">{syncNotice}</span>
        </div>
      )}

      {/* COMPACT APEXMAP ONSITE COMMAND HEADER (Fits above fold cleanly on mobile) */}
      <div className="bg-slate-900 text-white rounded-2xl p-3 sm:p-4 shadow-sm border border-slate-800 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                <Compass className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                  <span>ApexMap™ Onsite</span>
                  <span className="text-slate-500" aria-hidden="true">·</span>
                  <span className="text-sky-400 font-mono text-[11px] truncate">
                    {selectedProject.projectNumber}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {selectedProject.title} · 18 km/h NW Safe · 14.5% MC Dry
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSiteBriefExpanded(!isSiteBriefExpanded)}
              className="min-h-9 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 cursor-pointer shrink-0 whitespace-nowrap"
            >
              {isSiteBriefExpanded ? 'Hide Brief' : 'Site Brief'}
            </button>
          </div>

          {/* Compact Project + Crew Selectors */}
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Select Active Project"
              className="w-full sm:w-52 bg-slate-800 hover:bg-slate-750 text-white text-xs font-semibold rounded-xl px-2.5 py-2 border border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectNumber} · {p.title}
                </option>
              ))}
            </select>

            <select
              value={activeMemberId}
              onChange={(e) => setActiveMemberId(e.target.value)}
              aria-label="Select Active Inspector"
              className="w-full sm:w-44 bg-slate-800 hover:bg-slate-750 text-white text-xs font-medium rounded-xl px-2.5 py-2 border border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer truncate"
            >
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role.includes('LBP') ? 'LBP' : m.role.split(' ')[0]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Collapsible Site Brief, GPS, Contact & Weather Compliance */}
        {isSiteBriefExpanded && (
          <div className="pt-2.5 border-t border-slate-800 space-y-3 text-xs animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedProject.siteAddress)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-sky-300 hover:text-sky-200 hover:underline font-medium min-w-0"
              >
                <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">{selectedProject.siteAddress}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {selectedProject.clientPhone && (
                  <a
                    href={`tel:${selectedProject.clientPhone}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-semibold"
                  >
                    <Phone className="w-3 h-3" /> Call
                  </a>
                )}
                {selectedProject.clientPhone && (
                  <a
                    href={`sms:${selectedProject.clientPhone}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-semibold"
                  >
                    <MessageSquare className="w-3 h-3" /> SMS
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedProject.siteAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-bold"
                >
                  <Compass className="w-3 h-3" /> Navigate
                </a>
                <button
                  type="button"
                  onClick={() => setActiveCaptureModal('photo')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 rounded-lg text-[11px] font-semibold cursor-pointer"
                >
                  <Camera className="w-3 h-3" /> Photo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                <Wind className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <div className="text-[11px] font-bold text-white">18 km/h NW · Safe</div>
                  <div className="text-[10px] text-emerald-400">Under 45 km/h WorkSafe limit</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                <Droplets className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-[11px] font-bold text-white">14.5% MC · Dry Substrate</div>
                  <div className="text-[10px] text-emerald-400">NZBC E2/AS1 Compliant (&lt;18%)</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="text-[11px] font-bold text-white">{activeMember.name}</div>
                  <div className="text-[10px] text-slate-400">LBP BP134821 · {selectedProject.progressPercent || 0}% Complete</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* UNIFIED DESKTOP & MOBILE WORKSPACE MODE BAR */}
      <div className="hidden md:flex flex-wrap items-center justify-between gap-2 bg-white rounded-2xl border border-slate-200 p-1.5 shadow-2xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSection('roof_map')}
            className={`min-h-9 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              section === 'roof_map'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Compass className="w-4 h-4 text-sky-400" />
            <span>ApexMap™ Roof CAD &amp; Flashings</span>
          </button>

          <button
            onClick={() => setSection('flashings')}
            className={`min-h-9 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              section === 'flashings'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Ruler className="w-4 h-4 text-indigo-500" />
            <span>Flashing Workshop</span>
          </button>

          <button
            onClick={() => setSection('order_sheets')}
            className={`min-h-9 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              isOrdersSection
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShoppingCart className="w-4 h-4 text-emerald-500" />
            <span>Orders &amp; Cut Lists</span>
          </button>

          <button
            onClick={() => setSection('home')}
            className={`min-h-9 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              isFieldSection
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>Field Tools &amp; QA</span>
          </button>
        </div>

        <div className="flex items-center gap-2 pr-2 text-[11px] font-mono tabular-nums text-slate-500">
          <span className="text-emerald-700 font-bold">+{longRunStats.linealMetresSaved}m offcut steel saved</span>
          <span aria-hidden="true">·</span>
          <span>{longRunStats.totalSheetsOrdered} sheets</span>
        </div>
      </div>

      {/* Sub-navigation bar when inside Orders & Cut Lists */}
      {isOrdersSection && (
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 overflow-x-auto">
          {(
            [
              { id: 'order_sheets' as const, label: `Roofing Sheets (${longRunStats.totalSheetsOrdered})`, icon: ShoppingCart },
              { id: 'order_flashings' as const, label: `Folded Flashings (${longRunFlashings.length})`, icon: Layers },
              { id: 'cut_lists' as const, label: 'Ground Cut Lists', icon: CheckSquare }
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex-1 sm:flex-initial min-h-9 flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sub-navigation bar when inside Field Tools & QA */}
      {isFieldSection && (
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 overflow-x-auto">
          {(
            [
              { id: 'home' as const, label: 'Site Stream', icon: Building },
              { id: 'survey' as const, label: 'Laser Slope', icon: Ruler },
              { id: 'files' as const, label: `Plans (${plans.length})`, icon: FileText },
              { id: 'qa' as const, label: 'NZBC PS3 QA', icon: ShieldCheck },
              { id: 'tasks' as const, label: `Snags (${openSnags.length})`, icon: AlertTriangle },
              { id: 'photos' as const, label: `Photos (${photos.length})`, icon: Camera }
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`min-h-9 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 1. APEXMAP™ STUDIO: EXACT ROOFING + OFFCUTS + FLASHING WORKSHOP  */}
      {/* ---------------------------------------------------------------- */}
      {section === 'roof_map' && (
        <RoofMapOffcutVisualizer
          project={selectedProject}
          projects={projects}
          initialStage={
            selectedProject?.roofPlanModel?.stage ||
            (selectedProject?.roofPlanModel?.measureLocked ? 'installing' : 'measuring')
          }
          facets={longRunFacets}
          onUpdateFacets={setLongRunFacets}
          profileKey={longRunProfileKey}
          gauge={longRunGauge}
          colorName={longRunColor}
          activeMemberName={activeMember.name}
          embedded={true}
          onUpdateProject={onUpdateProject}
          onSaveToProject={(updatedFacets, planModel) => {
            const updated: Project = {
              ...selectedProject,
              roofMapFacets: updatedFacets,
              roofPlanModel: planModel,
              roofAreaM2: planModel?.bom?.totalRoofAreaM2 || selectedProject.roofAreaM2
            };
            onUpdateProject(updated);
            setLongRunFacets(updatedFacets);
            triggerNotice('ApexMap™ Roof Plan & Measures saved to project record');
          }}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 2. ORDER ROOFING SHEETS                                          */}
      {/* ---------------------------------------------------------------- */}
      {section === 'order_sheets' && (
        <LongRunSheetOrder
          project={selectedProject}
          facets={longRunFacets}
          onUpdateFacets={setLongRunFacets}
          profileKey={longRunProfileKey}
          onChangeProfileKey={setLongRunProfileKey}
          gauge={longRunGauge}
          onChangeGauge={setLongRunGauge}
          colorName={longRunColor}
          onChangeColorName={setLongRunColor}
          onDispatchOrder={handleDispatchLongRunOrder}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 3. ORDER FLASHINGS                                               */}
      {/* ---------------------------------------------------------------- */}
      {section === 'order_flashings' && (
        <LongRunFlashingOrder
          project={selectedProject}
          flashings={longRunFlashings}
          onUpdateFlashings={setLongRunFlashings}
          colorName={longRunColor}
          gauge={longRunGauge}
          onDispatchOrder={handleDispatchLongRunOrder}
          onOpenFlashingWorkshop={(view) => {
            if (view) setFlashingView(view);
            setSection('flashings');
          }}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 4. GROUND CUT LISTS                                              */}
      {/* ---------------------------------------------------------------- */}
      {section === 'cut_lists' && (
        <LongRunCutLists
          project={selectedProject}
          facets={longRunFacets}
          onUpdateFacets={setLongRunFacets}
          flashings={longRunFlashings}
          onUpdateFlashings={setLongRunFlashings}
          profileKey={longRunProfileKey}
          gauge={longRunGauge}
          colorName={longRunColor}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 1. TODAY & ACTIVITY STREAM                                      */}
      {/* ---------------------------------------------------------------- */}
      {section === 'home' && (
        <div className="space-y-4">
          {/* Quick Inline Field Note */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
            <input
              type="text"
              value={quickNoteText}
              onChange={(e) => setQuickNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveQuickNote()}
              placeholder="Drop an instant site note or weather update into the job stream..."
              className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
            <button
              onClick={handleSaveQuickNote}
              disabled={!quickNoteText.trim()}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              Post Note
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Activity Feed with Filters */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Live Job Activity Stream</h2>
                    <p className="text-[11px] text-slate-500">Real-time notes, photos, measures &amp; work tallies</p>
                  </div>

                  {/* Filter Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'photos', label: 'Photos' },
                        { id: 'measures', label: 'Measures' },
                        { id: 'snags', label: 'Snags' },
                        { id: 'logs', label: 'Work Tallies' }
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setFeedFilter(f.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                          feedFilter === f.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredFeed.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No activity entries matching this filter. Use the 1-Tap Quick Actions above to record progress.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredFeed.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/50 space-y-1.5 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                item.type === 'site_visit'
                                  ? 'bg-sky-100 text-sky-800'
                                  : item.type === 'time_logged'
                                  ? 'bg-purple-100 text-purple-800'
                                  : item.type === 'material_order'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.type === 'milestone'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              {item.type.replace('_', ' ')}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{item.title}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {formatTimeAgo(item.timestamp)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-700 leading-relaxed">{item.details}</p>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                          <span>Recorded by {item.author}</span>
                          <span>{item.timestamp}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Open Blockers & Today's Crew Schedule */}
            <div className="space-y-4">
              {/* Open Blockers Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Active Snags &amp; Blockers ({openSnags.length})
                    </h3>
                  </div>
                  <button
                    onClick={() => setSection('tasks')}
                    className="text-[11px] font-bold text-sky-700 hover:text-sky-900"
                  >
                    View All
                  </button>
                </div>

                {openSnags.length === 0 ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                    <div className="text-xs font-bold text-emerald-900">Zero Open Blockers</div>
                    <div className="text-[10px] text-emerald-700">Roof is clear for continuous installation</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {openSnags.slice(0, 3).map((snag) => (
                      <div
                        key={snag.id}
                        className="p-2.5 rounded-xl border border-rose-100 bg-rose-50/40 space-y-1 text-xs"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold text-slate-900 leading-snug">{snag.title}</span>
                          <span className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded shrink-0">
                            {snag.severity.split(' ')[0]}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {snag.location} · Assigned to {snag.assignedTo}
                        </div>
                        <button
                          onClick={() => handleToggleSnagStatus(snag.id)}
                          className="mt-1.5 w-full py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          ✓ Mark Resolved
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Site Contacts */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  Key Site Contacts
                </h3>
                <div className="space-y-2 text-xs">
                  <ContactRow
                    label="Client / Homeowner"
                    name={selectedProject.clientName}
                    phone={selectedProject.clientPhone}
                    email={selectedProject.clientEmail}
                  />
                  <ContactRow
                    label="Head Contractor / Builder"
                    name={selectedProject.builder || selectedProject.headContractor || 'On-site Supervisor'}
                  />
                  <ContactRow
                    label="Architect / Designer"
                    name={selectedProject.architect || 'Architectural Consultant'}
                  />
                  <ContactRow
                    label="Archtech Lead LBP"
                    name="Marcus Kuhtze (BP134821)"
                    phone="+64 21 849 201"
                    email="marcus@archtech.co.nz"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 2. LASER MEASURES & GEOMETRY                                     */}
      {/* ---------------------------------------------------------------- */}
      {section === 'survey' && (
        <div className="space-y-4">
          {/* Pitch & True Slope Calculator */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Ruler className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Laser Run &amp; True Raking Slope Calculator</h3>
                  <p className="text-[11px] text-slate-500">Converts horizontal plan runs to accurate cut slope lengths</p>
                </div>
              </div>
              <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                Multiplier: {(1 / Math.cos((calcPitchDeg * Math.PI) / 180)).toFixed(4)}x
              </span>
            </div>

            {/* Quick Glove-Friendly Pitch Buttons */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Roof Pitch Preset
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[3, 5, 8, 10, 15, 25, 35, 45].map((pitch) => (
                  <button
                    key={pitch}
                    onClick={() => setCalcPitchDeg(pitch)}
                    className={`py-2.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                      calcPitchDeg === pitch
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {pitch}°
                  </button>
                ))}
              </div>
            </div>

            {/* Plan Run Input & Calculated Result */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Horizontal Run (mm)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="50"
                    value={calcRunMm}
                    onChange={(e) => setCalcRunMm(Number(e.target.value))}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-mono text-sm font-bold text-slate-900"
                  />
                  <button
                    onClick={() => setCalcRunMm((r) => r + 500)}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-mono font-bold"
                  >
                    +500
                  </button>
                </div>
              </div>

              <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-sky-800 uppercase">Calculated True Slope</div>
                  <div className="font-mono text-xl font-bold text-sky-950 mt-0.5">
                    {calculateSlopeDistanceMm(calcRunMm, calcPitchDeg).slopeMm} mm
                  </div>
                  <div className="text-[10px] text-sky-700">
                    +{calculateSlopeDistanceMm(calcRunMm, calcPitchDeg).slopeMm - calcRunMm} mm raking pitch extension
                  </div>
                </div>

                <button
                  onClick={() => {
                    setMeasureRef(`Rake Run (${calcPitchDeg}°)`);
                    setMeasureCategory('Barge');
                    setActiveCaptureModal('measure');
                  }}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
                >
                  Log to Register
                </button>
              </div>
            </div>
          </div>

          {/* Site Measurement Register */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Verified Site Measurements</h3>
                <p className="text-[11px] text-slate-500">
                  {(surveyRecord.lineItems || []).length} lines · Total lineal:{' '}
                  {(
                    (surveyRecord.lineItems || []).reduce(
                      (acc, curr) => acc + (curr.measuredLengthMm || curr.lengthMm || 0),
                      0
                    ) / 1000
                  ).toFixed(2)}{' '}
                  lm
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveCaptureModal('measure')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Measurement
                </button>
              </div>
            </div>

            {(surveyRecord.lineItems || []).length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                No site measurements recorded yet. Use the slope calculator above or click "Add Measurement".
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(surveyRecord.lineItems || []).map((item) => {
                  const len = item.measuredLengthMm || item.lengthMm || 0;
                  const planLen = item.planLengthMm || len;
                  const delta = len - planLen;
                  const preset = ARCHITECTURAL_FLASHING_PRESETS.find((p) => p.id === item.linkedFlashingPresetId);

                  return (
                    <div key={item.id} className="p-4 hover:bg-slate-50/60 flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white">
                            {item.category}
                          </span>
                          <span className="text-xs font-bold text-slate-900">{item.reference}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {item.pitchDegrees ?? 0}° pitch
                          </span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase">
                            {item.method || 'laser'}
                          </span>
                        </div>
                        {item.notes && <p className="text-[11px] text-slate-500 italic">{item.notes}</p>}
                        {preset && (
                          <div className="text-[10px] text-sky-700 font-medium flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>Linked Profile: {preset.name} ({preset.girthTier || '301-450mm'})</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right font-mono shrink-0">
                        <div className="text-sm font-bold text-slate-900">{len.toLocaleString()} mm</div>
                        {item.planLengthMm !== undefined && delta !== 0 && (
                          <div
                            className={`text-[10px] font-semibold ${
                              delta > 0 ? 'text-amber-600' : 'text-emerald-600'
                            }`}
                          >
                            Plan: {planLen}mm ({delta > 0 ? `+${delta}` : delta}mm)
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            {/* Seamless 1-Click Connected Actions */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold">Seamless Workshop &amp; Order Connection</div>
                <div className="text-[11px] text-slate-400">Push verified measurements to custom folding or stock order</div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setSection('flashings')}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Open in Flashing Workshop
                </button>
                <button
                  onClick={() => setActiveCaptureModal('order')}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Order Coils / Stock
                </button>
              </div>
            </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 3. FLASHING WORKSHOP (Embedded Full Folding Tool)                */}
      {/* ---------------------------------------------------------------- */}
      {section === 'flashings' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-1.5 sm:p-4 shadow-xs">
          <FlashingWorkshop
            view={flashingView}
            onChangeView={setFlashingView}
            projects={selectedProject ? [selectedProject] : projects}
            project={selectedProject}
            activeMemberName={activeMember?.name || 'User'}
            onUpdateProject={onUpdateProject}
            roofAssignments={selectedProject?.roofPlanModel?.flashingAssignments}
            onClose={() => setSection('home')}
          />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 4. ARCHITECTURAL PLANS & MARKUP                                  */}
      {/* ---------------------------------------------------------------- */}
      {section === 'files' && (
        <div className="space-y-4">
          {selectedPlanForMarkup ? (
            <PlanMarkupTool
              project={selectedProject}
              plan={selectedPlanForMarkup}
              memberName={activeMember?.name || 'User'}
              onUpdateProject={onUpdateProject}
              onClose={() => setSelectedPlanForMarkup(null)}
              onOpenFlashingDesigner={() => {
                setSelectedPlanForMarkup(null);
                setSection('flashings');
              }}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Architectural &amp; Engineering Plans</h3>
                <p className="text-[11px] text-slate-500">
                  Select a drawing to measure dimensions, pin defects, and review roof geometry
                </p>
              </div>

              {plans.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400">
                  No plans attached to this project.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 truncate">{plan.title}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Sheet {plan.sheetNumber} · Rev {plan.revision}
                            {plan.scale ? ` · ${plan.scale}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => setSelectedPlanForMarkup(plan)}
                          className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Interactive Markup</span>
                        </button>
                        <a
                          href={plan.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 5. NZBC QA & COUNCIL PS3 PRODUCER STATEMENT                     */}
      {/* ---------------------------------------------------------------- */}
      {section === 'qa' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    NZBC E2/AS1 QA &amp; Council Producer Statement PS3
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Official building inspection protocol and digital LBP sign-off for Auckland &amp; NZ Councils
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPs3Preview(!showPs3Preview)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{showPs3Preview ? 'Hide PS3 Document' : 'View / Print PS3'}</span>
                </button>
              </div>
            </div>

            {/* Substrate & NZBC Compliance Verification Grid */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                NZBC E2/AS1 Table 7 Inspection Protocol
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-emerald-950">Substrate Moisture Compliance (&lt;18%)</div>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Verified 14.5% MC via calibrated pin meter. No swelling or delamination present.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-emerald-950">Underlay &amp; Vapour Barrier Laps (&ge;150mm)</div>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Breathable synthetic underlay continuous, taped at all horizontal/vertical laps.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-emerald-950">Fasteners &amp; Sliding Thermal Cleats</div>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Stainless sliding cleats installed every 350mm with fixed anchoring at ridge apex.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-emerald-950">Flashings &amp; Upstand Clearances (&ge;85mm)</div>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Kick-out apron flashings and 5° parapet inward slope conform strictly to E2/AS1.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Official PS3 Producer Statement Preview & Printable Form */}
            {showPs3Preview && (
              <div className="p-6 bg-slate-50 border border-slate-300 rounded-2xl space-y-5 text-slate-800">
                <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                  <div>
                    <div className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                      Producer Statement - PS3 (Construction)
                    </div>
                    <div className="text-xs text-slate-600">
                      Profiled Metal Roofing &amp; Architectural Wall Cladding Systems
                    </div>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print PDF</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="font-bold text-slate-500 uppercase block text-[10px]">Project Address</span>
                    <span className="font-semibold text-slate-900">{selectedProject.siteAddress}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 uppercase block text-[10px]">Building Consent No.</span>
                    <span className="font-semibold text-slate-900">BC-2026-9481</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 uppercase block text-[10px]">Client / Owner</span>
                    <span className="font-semibold text-slate-900">{selectedProject.clientName}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 uppercase block text-[10px]">Installed System</span>
                    <span className="font-semibold text-slate-900">
                      Archtech Standing Seam &amp; The Roofing Store Profiled Metal
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed bg-white p-3.5 rounded-xl border border-slate-200">
                  I, <strong>Marcus Kuhtze</strong> (Licensed Building Practitioner <strong>BP134821</strong>),
                  certify that the installation of profiled metal roofing and associated architectural flashings at
                  the above site has been completed in full compliance with the approved consent drawings, the New
                  Zealand Building Code Clauses <strong>B2 (Durability)</strong> and <strong>E2 (External Moisture)</strong>,
                  and NZBC Acceptable Solution E2/AS1.
                </p>

                <div className="pt-2 flex items-center justify-between border-t border-slate-200 text-xs">
                  <div>
                    <div className="font-bold text-slate-900">Marcus Kuhtze</div>
                    <div className="text-[10px] text-slate-500">LBP BP134821 · Managing Director</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-emerald-700 font-bold">DIGITALLY SIGNED &amp; VERIFIED</div>
                    <div className="text-[10px] text-slate-500">{new Date().toLocaleDateString('en-NZ')}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 6. SNAGS & PUNCHLIST                                            */}
      {/* ---------------------------------------------------------------- */}
      {section === 'tasks' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-0">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Punchlist &amp; Snagging Log</h3>
              <p className="text-[11px] text-slate-500">
                Track and resolve site items before council sign-off and final handover
              </p>
            </div>
            <button
              onClick={() => setActiveCaptureModal('snag')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Blocker</span>
            </button>
          </div>

          {snags.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Zero snags recorded. Roof installation is clean!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {snags.map((snag) => (
                <div key={snag.id} className="p-4 hover:bg-slate-50/60 flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          snag.status === 'Resolved & Verified'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {snag.status}
                      </span>
                      <span className="text-xs font-bold text-slate-900">{snag.title}</span>
                      <span className="text-[10px] text-slate-500">· {snag.location}</span>
                    </div>
                    {snag.notes && <p className="text-xs text-slate-600">{snag.notes}</p>}
                    <div className="text-[10px] text-slate-400">
                      Assigned to <strong className="text-slate-600">{snag.assignedTo}</strong>
                      {snag.resolvedAt ? ` · Resolved on ${snag.resolvedAt}` : ''}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleSnagStatus(snag.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                      snag.status === 'Resolved & Verified'
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {snag.status === 'Resolved & Verified' ? 'Reopen' : '✓ Mark Resolved'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 7. ORDERS & MATERIAL LOG                                         */}
      {/* ---------------------------------------------------------------- */}
      {section === 'orders' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Onsite Supply &amp; Flashing Orders</h3>
              <p className="text-[11px] text-slate-500">
                Direct integration with The Roofing Store and Archtech workshop
              </p>
            </div>
            <button
              onClick={() => setActiveCaptureModal('order')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Express Order</span>
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No material orders placed for this site yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orders.map((o) => (
                <div key={o.id} className="p-4 hover:bg-slate-50/60 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold bg-slate-100 px-2.5 py-0.5 rounded text-slate-800">
                      {o.orderNumber}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                      {o.status}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-900">{o.supplier}</div>

                  <div className="text-[11px] text-slate-500">
                    {o.items.map((i) => `${i.quantity} ${i.unit} ${i.itemDescription}`).join(', ')}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span>Ordered by {o.orderedBy}</span>
                    <span>ETA: {o.deliveryEta || 'Standard delivery'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 8. PHOTO GALLERY & CLIENT PORTAL SYNC                           */}
      {/* ---------------------------------------------------------------- */}
      {section === 'photos' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Site Progress Photos</h3>
              <p className="text-[11px] text-slate-500">
                Visual history categorized by phase. Toggle photos to appear in the live Client Portal.
              </p>
            </div>
            <button
              onClick={() => setActiveCaptureModal('photo')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Capture Photo</span>
            </button>
          </div>

          {photos.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No photos captured yet. Tap "Capture Photo" to record substrate or installation work.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {photos.map((ph) => (
                <div
                  key={ph.id}
                  className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 group hover:shadow-md transition-shadow"
                >
                  <div className="aspect-video relative overflow-hidden bg-slate-900">
                    <img
                      src={ph.url}
                      alt={ph.caption}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2.5 left-2.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-900/80 text-white backdrop-blur-xs">
                        {ph.phase || 'Install'}
                      </span>
                    </div>

                    <button
                      onClick={() => handleTogglePhotoVisibility(ph.id)}
                      className={`absolute top-2.5 right-2.5 text-[10px] font-bold px-2.5 py-1 rounded-md backdrop-blur-xs transition-colors cursor-pointer ${
                        ph.isPublicToClient
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-900/80 text-slate-300 hover:text-white'
                      }`}
                      title="Toggle visibility in Client Portal"
                    >
                      {ph.isPublicToClient ? '✓ In Client Portal' : 'Private / QA'}
                    </button>
                  </div>

                  <div className="p-3 space-y-1">
                    <div className="text-xs font-bold text-slate-900 truncate">{ph.caption}</div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{ph.author}</span>
                      <span>{ph.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* QUICK CAPTURE MODALS                                             */}
      {/* ================================================================ */}

      {/* 1. PHOTO CAPTURE MODAL */}
      {activeCaptureModal === 'photo' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">Capture Site Photo</h3>
              </div>
              <button
                onClick={() => setActiveCaptureModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                  Installation Phase
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Substrate', 'Underlay', 'Trays', 'Flashings', 'QA', 'Variation'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPhotoPhase(p)}
                      className={`py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        photoPhase === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Photo Caption / Note</label>
                <input
                  type="text"
                  value={photoCaption}
                  onChange={(e) => setPhotoCaption(e.target.value)}
                  placeholder="e.g. North barge flashing folded & hemmed with 85mm upstand"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Photo URL (Optional)</label>
                <input
                  type="text"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="Leave blank to use trade sample photo"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900"
                />
              </div>

              <label className="flex items-center gap-2 p-3 bg-sky-50 border border-sky-100 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={photoPublishToPortal}
                  onChange={(e) => setPhotoPublishToPortal(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded"
                />
                <span className="text-xs font-semibold text-sky-950">
                  Publish to Live Client Portal (Client can see this update)
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setActiveCaptureModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePhoto}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Save Photo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. LASER MEASURE MODAL */}
      {activeCaptureModal === 'measure' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Ruler className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Record Laser Site Measure</h3>
              </div>
              <button
                onClick={() => setActiveCaptureModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                  Location / Run Reference
                </label>
                <input
                  type="text"
                  value={measureRef}
                  onChange={(e) => setMeasureRef(e.target.value)}
                  placeholder="e.g. West Gable Barge (Grid 2 to 5)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Category</label>
                  <select
                    value={measureCategory}
                    onChange={(e) => setMeasureCategory(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                  >
                    {['Ridge', 'Barge', 'Eaves', 'Valley', 'Apron', 'Parapet', 'Cladding', 'Custom'].map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Pitch (°)</label>
                  <input
                    type="number"
                    value={calcPitchDeg}
                    onChange={(e) => setCalcPitchDeg(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-xs text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Horizontal Run (mm)</label>
                  <input
                    type="number"
                    step="50"
                    value={calcRunMm}
                    onChange={(e) => setCalcRunMm(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-xs text-slate-900 font-bold"
                  />
                </div>

                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 flex flex-col justify-center">
                  <div className="text-[9px] font-bold text-emerald-800 uppercase">Calculated True Slope</div>
                  <div className="font-mono text-sm font-bold text-emerald-950">
                    {calculateSlopeDistanceMm(calcRunMm, calcPitchDeg).slopeMm} mm
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                  Link Flashing Preset
                </label>
                <select
                  value={measurePresetId}
                  onChange={(e) => setMeasurePresetId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                >
                  {ARCHITECTURAL_FLASHING_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.girthTier})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notes / Splice Allowance</label>
                <input
                  type="text"
                  value={measureNotes}
                  onChange={(e) => setMeasureNotes(e.target.value)}
                  placeholder="e.g. Add 150mm overlap at corner"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setActiveCaptureModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMeasure}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Save Measure
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. DAILY WORK TALLY MODAL */}
      {activeCaptureModal === 'daily_tally' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">Log Daily Progress Tally</h3>
              </div>
              <button
                onClick={() => setActiveCaptureModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Trays / Sheets Laid</label>
                  <input
                    type="number"
                    value={tallyTraysCount}
                    onChange={(e) => setTallyTraysCount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Lineal Metres (lm)</label>
                  <input
                    type="number"
                    value={tallyLm}
                    onChange={(e) => setTallyLm(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Seaming Progress (%)</label>
                  <input
                    type="number"
                    value={tallySeamingPercent}
                    onChange={(e) => setTallySeamingPercent(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Crew On Site</label>
                  <input
                    type="number"
                    value={tallyCrewCount}
                    onChange={(e) => setTallyCrewCount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notes / Delay Items</label>
                <textarea
                  rows={2}
                  value={tallyNotes}
                  onChange={(e) => setTallyNotes(e.target.value)}
                  placeholder="e.g. Laid east pitch, double seamed to ridge. Substrate clean."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setActiveCaptureModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDailyTally}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Record Tally
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SNAG / BLOCKER MODAL */}
      {activeCaptureModal === 'snag' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-bold text-slate-900">Log Site Blocker / Snag</h3>
              </div>
              <button
                onClick={() => setActiveCaptureModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Issue Title</label>
                <input
                  type="text"
                  value={snagTitle}
                  onChange={(e) => setSnagTitle(e.target.value)}
                  placeholder="e.g. Valley substrate needs 3mm chamfer edge before tray lay"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Location on Roof</label>
                  <input
                    type="text"
                    value={snagLocation}
                    onChange={(e) => setSnagLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Assignee</label>
                  <select
                    value={snagAssignee}
                    onChange={(e) => setSnagAssignee(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                  >
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Severity</label>
                <select
                  value={snagSeverity}
                  onChange={(e) => setSnagSeverity(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                >
                  <option value="Critical (Weathertightness / Blocker)">Critical (Weathertightness / Blocker)</option>
                  <option value="Moderate (Aesthetic / Flashing)">Moderate (Aesthetic / Flashing)</option>
                  <option value="Minor (Cosmetic / Touch-up)">Minor (Cosmetic / Touch-up)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setActiveCaptureModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSnag}
                  disabled={!snagTitle.trim()}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Add to Fix List
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. LOG TIME MODAL */}
      {activeCaptureModal === 'time' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Log Site Labour Hours</h3>
              </div>
              <button
                onClick={() => setActiveCaptureModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Hours Worked</label>
                  <input
                    type="number"
                    step="0.5"
                    value={timeHours}
                    onChange={(e) => setTimeHours(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tradesman</label>
                  <select
                    value={timeWorker}
                    onChange={(e) => setTimeWorker(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                  >
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Work Phase</label>
                <select
                  value={timePhase}
                  onChange={(e) => setTimePhase(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                >
                  <option value="Substrate Preparation">Substrate Preparation</option>
                  <option value="Underlay & Thermal Spacer">Underlay &amp; Thermal Spacer</option>
                  <option value="Tray Installation">Tray Installation</option>
                  <option value="Mechanical Seaming">Mechanical Seaming</option>
                  <option value="Flashing Folding & Install">Flashing Folding &amp; Install</option>
                  <option value="E2/AS1 QA & Sign-off">E2/AS1 QA &amp; Sign-off</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Work Notes</label>
                <input
                  type="text"
                  value={timeNotes}
                  onChange={(e) => setTimeNotes(e.target.value)}
                  placeholder="e.g. Completed South face tray install"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setActiveCaptureModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTime}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Save Labour
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. EXPRESS MATERIAL ORDER MODAL (THE ROOFING STORE) */}
      {activeCaptureModal === 'order' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">Express Order - The Roofing Store</h3>
              </div>
              <button
                onClick={() => setActiveCaptureModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Branch</label>
                <select
                  value={orderSupplier}
                  onChange={(e) => setOrderSupplier(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                >
                  <option value="The Roofing Store (Albany)">The Roofing Store (Albany)</option>
                  <option value="The Roofing Store (East Tamaki)">The Roofing Store (East Tamaki)</option>
                  <option value="The Roofing Store (Highbrook)">The Roofing Store (Highbrook)</option>
                  <option value="The Roofing Store (Hamilton)">The Roofing Store (Hamilton)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Urgency</label>
                <select
                  value={orderUrgency}
                  onChange={(e) => setOrderUrgency(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                >
                  <option value="Urgent Same-Day HIAB">Urgent Same-Day HIAB</option>
                  <option value="Foreman Branch Collection">Foreman Branch Collection</option>
                  <option value="Standard Delivery">Standard Delivery</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Material Needed</label>
                <input
                  type="text"
                  placeholder="e.g. Stainless sliding clips (box of 250) or 0.55mm coil"
                  value={orderItemDesc}
                  onChange={(e) => setOrderItemDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Quantity</label>
                  <input
                    type="number"
                    value={orderItemQty}
                    onChange={(e) => setOrderItemQty(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unit</label>
                  <select
                    value={orderItemUnit}
                    onChange={(e) => setOrderItemUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                  >
                    <option value="pcs">Pieces</option>
                    <option value="boxes">Boxes</option>
                    <option value="rolls">Rolls</option>
                    <option value="lm">Lineal Metres</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setActiveCaptureModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveExpressOrder}
                  disabled={!orderItemDesc.trim()}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Send Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STICKY MOBILE BOTTOM THUMB DOCK FOR APEXMAP ONSITE */}
      <nav
        aria-label="ApexMap Onsite Navigation"
        className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-2 pt-1.5 pb-[calc(0.35rem+env(safe-area-inset-bottom))] grid grid-cols-4 gap-1"
      >
        <button
          onClick={() => setSection('roof_map')}
          className={`min-h-11 flex flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-colors cursor-pointer ${
            section === 'roof_map'
              ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Compass className="w-4 h-4 mb-0.5" />
          <span>Roof CAD</span>
        </button>

        <button
          onClick={() => setSection('flashings')}
          className={`min-h-11 flex flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-colors cursor-pointer ${
            section === 'flashings'
              ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Ruler className="w-4 h-4 mb-0.5" />
          <span>Flashings</span>
        </button>

        <button
          onClick={() => setSection('order_sheets')}
          className={`min-h-11 flex flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-colors cursor-pointer ${
            isOrdersSection
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingCart className="w-4 h-4 mb-0.5" />
          <span>Orders</span>
        </button>

        <button
          onClick={() => setSection('home')}
          className={`min-h-11 flex flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-colors cursor-pointer ${
            isFieldSection
              ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4 mb-0.5" />
          <span>Field Hub</span>
        </button>
      </nav>
    </div>
  );
};

function ContactRow({
  label,
  name,
  phone,
  email
}: {
  label: string;
  name?: string;
  phone?: string;
  email?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 space-y-0.5">
      <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
      <div className="text-xs font-semibold text-slate-900">{name || '—'}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 pt-0.5">
        {phone && (
          <a href={`tel:${phone}`} className="flex items-center gap-1 hover:text-sky-700">
            <Phone className="w-3 h-3 text-slate-400" />
            <span>{phone}</span>
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="flex items-center gap-1 hover:text-sky-700 truncate">
            <Mail className="w-3 h-3 text-slate-400" />
            <span className="truncate">{email}</span>
          </a>
        )}
      </div>
    </div>
  );
}