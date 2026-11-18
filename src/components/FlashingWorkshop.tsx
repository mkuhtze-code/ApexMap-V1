import React, { useEffect, useMemo, useState } from 'react';
import { 
  BookOpen, 
  Check, 
  ClipboardList, 
  Plus, 
  Ruler, 
  ShoppingCart, 
  Pencil, 
  X, 
  Printer, 
  Download, 
  FileSpreadsheet, 
  ShieldCheck, 
  Layers,
  ArrowRight,
  Info,
  RotateCcw,
  MapPin
} from 'lucide-react';
import { FlashingDesigner } from './FlashingDesigner';
import { FlashingProfile, Project, FlashingGirthTier } from '../types/crm';
import { RoofFlashingAssignment } from '../types/exactRoofing';
import { 
  DEFAULT_ARCHITECTURAL_PROFILES, 
  calculateFlashingEngineering, 
  FlashingCalculationSummary,
  classifyGirthTier
} from '../utils/sheetMetalGeometry';

type WorkshopView = 'library' | 'orders';

export interface FlashingOrderLine {
  id: string;
  projectId?: string;
  projectName?: string;
  profileId: string;
  profileName: string;
  quantity: number;
  pieceLengthLm: number;
  totalLinearMetres: number;
  girthTier?: FlashingGirthTier;
  developedBlankWidthMm?: number;
  notes?: string;
  createdAt: string;
  status: 'Draft' | 'Ready for production';
}

interface Props {
  view: WorkshopView;
  onChangeView: (view: WorkshopView) => void;
  projects: Project[];
  activeMemberName: string;
  project?: Project;
  theme?: 'light' | 'dark';
  roofAssignments?: RoofFlashingAssignment[];
  onClose?: () => void;
  onPushToQuote?: (order: FlashingOrderLine) => void;
  onUpdateProject?: (project: Project) => void;
}

const LIBRARY_STORAGE_KEY = 'archtech_flashing_library';
const ORDER_STORAGE_KEY = 'archtech_flashing_orders';

function readStoredArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function makeId(prefix: string) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function developedLength(profile: FlashingProfile) {
  return profile.developedLengthMm || profile.segments.reduce((sum, segment) => sum + segment.lengthMm, 0);
}

function profilePreviewPoints(profile: FlashingProfile) {
  let points: { x: number; y: number }[];
  if (profile.geometryPointsMm?.length === profile.segments.length + 1) {
    points = profile.geometryPointsMm.slice(0, 15).map((point) => ({ x: point.x, y: -point.y }));
  } else {
    points = [{ x: 8, y: 44 }];
    let heading = 0;
    let x = 8;
    let y = 44;
    const segments = profile.segments.slice(0, 14);
    segments.forEach((segment, index) => {
      const length = Math.max(8, segment.lengthMm || 8);
      const scale = 145 / Math.max(1, segments.reduce((sum, item) => sum + Math.max(8, item.lengthMm || 8), 0));
      x += Math.cos(heading * Math.PI / 180) * length * scale;
      y -= Math.sin(heading * Math.PI / 180) * length * scale;
      points.push({ x, y });
      if (index < segments.length - 1) {
        const bend = Math.max(0, Math.min(180, 180 - (segment.angleDeg || 90)));
        heading += bend * (segment.turnDirection || 1);
      }
    });
  }
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min(210 / width, 66 / height);
  const offsetX = (240 - width * scale) / 2;
  const offsetY = (90 - height * scale) / 2;
  return points.map((point) => `${(offsetX + (point.x - minX) * scale).toFixed(1)},${(offsetY + (point.y - minY) * scale).toFixed(1)}`).join(' ');
}

export function ProfileThumbnail({
  profile,
  large = false,
  dark = false
}: {
  profile: FlashingProfile;
  large?: boolean;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border ${
        dark
          ? 'border-slate-800 bg-[#070b14]'
          : 'border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100'
      } ${large ? 'h-28' : 'h-20'}`}
    >
      <svg viewBox="0 0 240 90" role="img" aria-label={`Cross-section drawing of ${profile.name}`} className="h-full w-full max-w-[280px] overflow-visible">
        <polyline
          points={profilePreviewPoints(profile)}
          fill="none"
          stroke={dark ? '#38bdf8' : '#0284c7'}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="120" cy="45" r="2.5" fill={dark ? '#94a3b8' : '#0f172a'} opacity="0.45" />
      </svg>
    </div>
  );
}

export const FlashingWorkshop: React.FC<Props> = ({ 
  view, 
  onChangeView, 
  projects, 
  activeMemberName, 
  project, 
  theme = 'light',
  roofAssignments = [],
  onClose,
  onPushToQuote,
  onUpdateProject
}) => {
  const [library, setLibrary] = useState<FlashingProfile[]>(() => {
    const stored = readStoredArray<FlashingProfile>(LIBRARY_STORAGE_KEY);
    return stored.length > 0 ? stored : DEFAULT_ARCHITECTURAL_PROFILES;
  });

  const [orders, setOrders] = useState<FlashingOrderLine[]>(() => readStoredArray<FlashingOrderLine>(ORDER_STORAGE_KEY));
  const [designerOpen, setDesignerOpen] = useState(false);
  const [workingProfiles, setWorkingProfiles] = useState<FlashingProfile[]>([]);
  const [initialProfileId, setInitialProfileId] = useState<string | null>(null);
  const [designerInstance, setDesignerInstance] = useState(0);

  // Order creation form state
  const [orderProfileId, setOrderProfileId] = useState('');
  const [quantity, setQuantity] = useState('4');
  const [pieceLengthLm, setPieceLengthLm] = useState('3.0');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderMessage, setOrderMessage] = useState('');

  // Workshop Cut Sheet Modal State
  const [cutSheetModalProfile, setCutSheetModalProfile] = useState<{
    profile: FlashingProfile;
    pieceCount: number;
    pieceLengthLm: number;
    orderNotes?: string;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    if (!orderProfileId && library.length > 0) setOrderProfileId(library[0].id);
    if (orderProfileId && !library.some((profile) => profile.id === orderProfileId)) {
      setOrderProfileId(library[0]?.id || '');
    }
  }, [library, orderProfileId]);

  const baseProject = project || projects[0];
  const visibleOrders = project ? orders.filter((line) => line.projectId === project.id) : orders;

  const designerProject = useMemo(() => ({
    ...(baseProject || {}),
    projectNumber: baseProject?.projectNumber || 'ARCH-2026-041',
    material: baseProject?.material || 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
    colorName: baseProject?.colorName || 'FlaxPod',
    flashingProfiles: workingProfiles
  } as Project), [baseProject, workingProfiles]);

  const openBlankDesigner = () => {
    setWorkingProfiles([]);
    setInitialProfileId(null);
    setDesignerInstance((value) => value + 1);
    setDesignerOpen(true);
  };

  const openLibraryProfile = (profile: FlashingProfile) => {
    setWorkingProfiles([{ ...profile, segments: profile.segments.map((segment) => ({ ...segment })) }]);
    setInitialProfileId(profile.id);
    setDesignerInstance((value) => value + 1);
    setDesignerOpen(true);
  };

  const saveToLibrary = (profile: FlashingProfile) => {
    const name = profile.name.trim();
    if (!name || library.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) return 'duplicate';
    const nextLibrary = [profile, ...library];
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(nextLibrary));
    } catch (error) {
      console.error('Unable to persist flashing library to browser storage.', error);
      return 'storage-error';
    }
    setLibrary(nextLibrary);
    return 'saved';
  };

  const handleResetToStandards = () => {
    setLibrary(DEFAULT_ARCHITECTURAL_PROFILES);
    setOrderMessage('Reset library to 6 pre-engineered NZBC E2/AS1 standard profiles.');
  };

  const addOrderLine = (event: React.FormEvent) => {
    event.preventDefault();
    const profile = library.find((item) => item.id === orderProfileId);
    const count = Number(quantity);
    const length = Number(pieceLengthLm);

    if (!profile || !Number.isFinite(count) || count < 1 || !Number.isInteger(count) || !Number.isFinite(length) || length <= 0) {
      setOrderMessage('Choose a profile, whole-piece quantity, and length greater than zero.');
      return;
    }

    const legs = profile.segments.map(s => ({
      id: s.id,
      lengthMm: s.lengthMm,
      interiorAngleDeg: s.angleDeg,
      turnDirection: s.turnDirection,
      kind: (s.kind === 'hem' ? 'open_hem' : s.kind) as any
    }));
    const eng = calculateFlashingEngineering(legs, 'vitor_055', length, count);

    const line: FlashingOrderLine = {
      id: makeId('fl-order'),
      projectId: project?.id || baseProject?.id,
      projectName: project?.title || baseProject?.title,
      profileId: profile.id,
      profileName: profile.name,
      quantity: count,
      pieceLengthLm: length,
      totalLinearMetres: Math.round(count * length * 100) / 100,
      girthTier: eng.girthTier,
      developedBlankWidthMm: eng.developedBlankWidthMm,
      notes: orderNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
      status: 'Ready for production'
    };

    setOrders((previous) => [line, ...previous]);
    setQuantity('4');
    setPieceLengthLm('3.0');
    setOrderNotes('');
    setOrderMessage(`Added ${line.totalLinearMetres}m of ${profile.name} (${eng.girthTier}) to production order.`);
  };

  const removeOrderLine = (id: string) => setOrders((previous) => previous.filter((line) => line.id !== id));

  const handleImportPlanPins = () => {
    const pins = project?.flashingPins || [];
    if (!pins.length) return;
    const newLines: FlashingOrderLine[] = pins.map((pin) => {
      const matchingProfile = library.find(p => p.id === pin.profileId) || library[0];
      const count = pin.quantity || Math.max(1, Math.ceil(pin.lengthLm / 3.0));
      const pieceLen = Math.round((pin.lengthLm / count) * 10) / 10 || 3.0;
      const legs = matchingProfile.segments.map(s => ({
        id: s.id,
        lengthMm: s.lengthMm,
        interiorAngleDeg: s.angleDeg,
        turnDirection: s.turnDirection,
        kind: (s.kind === 'hem' ? 'open_hem' : s.kind) as any
      }));
      const eng = calculateFlashingEngineering(legs, 'vitor_055', pieceLen, count);
      return {
        id: makeId('fl-order-pin'),
        projectId: project?.id || baseProject?.id,
        projectName: project?.title || baseProject?.title,
        profileId: matchingProfile.id,
        profileName: matchingProfile.name,
        quantity: count,
        pieceLengthLm: pieceLen,
        totalLinearMetres: Math.round(pin.lengthLm * 100) / 100,
        girthTier: pin.girthTier || eng.girthTier,
        developedBlankWidthMm: eng.developedBlankWidthMm,
        notes: `Imported from Drawing Pin: ${pin.label} (${pin.lengthLm} lm)`,
        createdAt: new Date().toISOString(),
        status: 'Ready for production'
      };
    });
    setOrders((prev) => [...newLines, ...prev]);
    setOrderMessage(`Imported ${newLines.length} flashing pins from architectural drawing!`);
  };

  const handlePushOrdersToJob = () => {
    if (!visibleOrders.length) return;
    const targetProj = project || baseProject;
    if (!targetProj) return;

    const items = visibleOrders.map((ord, idx) => ({
      id: `fl-item-${idx + 1}-${Date.now()}`,
      itemDescription: `${ord.profileName} (${ord.girthTier}) · ${ord.pieceLengthLm}m sticks · ${ord.notes || 'Cut to measure'}`,
      category: 'Flashings',
      quantity: ord.quantity,
      unit: '3.0m sticks',
      urgencyReason: 'Workshop batch order'
    }));

    const newOrder = {
      id: `ord-${Date.now()}`,
      orderNumber: `FL-WS-${Math.floor(1000 + Math.random() * 9000)}`,
      projectId: targetProj.id,
      projectNumber: targetProj.projectNumber,
      orderedBy: activeMemberName || 'Workshop Lead',
      supplier: 'The Roofing Store (Highbrook)' as const,
      orderDate: new Date().toISOString().split('T')[0],
      deliverySiteAddress: targetProj.siteAddress,
      status: 'Draft' as const,
      urgency: 'Standard Delivery' as const,
      items,
      deliveryEta: '2 business days'
    };

    if (onUpdateProject) {
      onUpdateProject({
        ...targetProj,
        materialOrders: [newOrder, ...(targetProj.materialOrders || [])]
      });
      setOrderMessage(`Pushed ${visibleOrders.length} flashing lines to Job Orders (#${newOrder.orderNumber})!`);
    } else {
      setOrderMessage(`Packaged ${visibleOrders.length} flashing lines as Job Material Order #${newOrder.orderNumber}!`);
    }
  };

  // Compute engineering for cut sheet modal
  const cutSheetEngineering: FlashingCalculationSummary | null = useMemo(() => {
    if (!cutSheetModalProfile) return null;
    const { profile, pieceCount, pieceLengthLm } = cutSheetModalProfile;
    const legs = profile.segments.map(s => ({
      id: s.id,
      lengthMm: s.lengthMm,
      interiorAngleDeg: s.angleDeg,
      turnDirection: s.turnDirection,
      kind: (s.kind === 'hem' ? 'open_hem' : s.kind) as any
    }));
    return calculateFlashingEngineering(legs, 'vitor_055', pieceLengthLm, pieceCount);
  }, [cutSheetModalProfile]);

  const isDark = theme === 'dark';

  const handleQuickOrderProfile = (profile: FlashingProfile) => {
    setOrderProfileId(profile.id);
    setQuantity('4');
    setPieceLengthLm('3.0');
    setOrderNotes(`Standard run · ${profile.name}`);
    onChangeView('orders');
    setOrderMessage(`Ready to order "${profile.name}" — adjust qty/length below and tap Add to Order.`);
  };

  const handleImportRoofAssignments = () => {
    if (!roofAssignments.length) return;
    const newLines: FlashingOrderLine[] = roofAssignments.map((a) => ({
      id: makeId('fl-roof'),
      projectId: project?.id || baseProject?.id,
      projectName: project?.title || baseProject?.title,
      profileId: a.profileId,
      profileName: a.profileName,
      quantity: a.quantity,
      pieceLengthLm: a.pieceLengthLm,
      totalLinearMetres: Math.round(a.totalLinearMetres * 100) / 100,
      girthTier: (a.girthTier as FlashingGirthTier | undefined) ?? (a.developedBlankWidthMm ? classifyGirthTier(a.developedBlankWidthMm) : undefined),
      developedBlankWidthMm: a.developedBlankWidthMm,
      notes: `${a.lineLabel} (${a.trueSlopeLengthM.toFixed(2)}m sloped)${a.notes ? ` · ${a.notes}` : ''}`,
      createdAt: new Date().toISOString(),
      status: 'Ready for production'
    }));
    setOrders((prev) => [...newLines, ...prev]);
    onChangeView('orders');
    setOrderMessage(`Imported ${newLines.length} assigned roof lines into production orders.`);
  };

  if (designerOpen) {
    return (
      <FlashingDesigner
        key={designerInstance}
        project={designerProject}
        activeMemberName={activeMemberName}
        onUpdateProject={(updated) => setWorkingProfiles(updated.flashingProfiles || [])}
        onClose={() => setDesignerOpen(false)}
        initialProfileId={initialProfileId}
        onSaveToLibrary={saveToLibrary}
      />
    );
  }

  return (
    <div className="space-y-4 font-sans pb-6">
      {/* Top Header */}
      <div
        className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-2xl border ${
          isDark
            ? 'bg-[#0b101d] border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
        }`}
      >
        <div className="min-w-0">
          <div className={`flex items-center gap-2 text-xs font-bold tracking-wide ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
            <Ruler className="h-4 w-4 shrink-0" />
            <span>Flashing Workshop</span>
            {project && (
              <>
                <span className={isDark ? 'text-slate-600' : 'text-slate-300'} aria-hidden="true">·</span>
                <span className={`truncate font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {project.projectNumber} · {project.title}
                </span>
              </>
            )}
          </div>
          <h2 className={`mt-1 text-lg sm:text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {view === 'library' ? 'Profile Library & Custom CAD' : 'Fabrication & Production Orders'}
          </h2>
          <p className={`mt-0.5 max-w-2xl text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Exact bend deduction (BD), K-factor 0.38, girth tiers &amp; brake press folding sequences. Tap any card to draw, inspect cut sheet, or queue an order.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onClose && (
            <button
              onClick={onClose}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer transition-colors ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <X className="h-3.5 w-3.5" /> Back
            </button>
          )}
          {view === 'library' && (
            <button
              type="button"
              onClick={handleResetToStandards}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                isDark
                  ? 'border-slate-800 bg-slate-900/70 text-slate-300 hover:text-white hover:bg-slate-800'
                  : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="Restore standard architectural profiles"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Presets</span>
            </button>
          )}
          <button
            onClick={openBlankDesigner}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-2xs cursor-pointer transition-colors ${
              isDark
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>Draw Custom Flashing</span>
          </button>
        </div>
      </div>

      {/* Assigned Roof Lines Quick Sync Banner (when ApexMap Roof Plan has assigned flashings) */}
      {roofAssignments.length > 0 && (
        <div
          className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            isDark
              ? 'bg-emerald-950/35 border-emerald-700/60 text-emerald-100'
              : 'bg-emerald-50 border-emerald-200 text-emerald-950'
          }`}
        >
          <div className="min-w-0">
            <div className="font-bold flex items-center gap-1.5">
              <Layers className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
              <span>
                {roofAssignments.length} Roof Plan Edge{roofAssignments.length === 1 ? '' : 's'} Assigned
              </span>
              <span aria-hidden="true" className="opacity-50">·</span>
              <span className="font-mono tabular-nums">
                {roofAssignments.reduce((acc, a) => acc + a.totalLinearMetres, 0).toFixed(1)} lm ready
              </span>
            </div>
            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-emerald-300/80' : 'text-emerald-800'}`}>
              Pull all ridges, valleys, and barges directly from your ApexMap roof plan into workshop fabrication orders.
            </p>
          </div>
          <button
            type="button"
            onClick={handleImportRoofAssignments}
            className="min-h-10 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shrink-0 cursor-pointer flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Import to Orders</span>
          </button>
        </div>
      )}

      {/* Segmented Tabs */}
      <div
        className={`flex items-center gap-1 p-1 rounded-xl border w-full sm:w-fit ${
          isDark
            ? 'bg-[#0b101d] border-slate-800'
            : 'bg-slate-100 border-slate-200'
        }`}
      >
        <button
          onClick={() => onChangeView('library')}
          className={`flex-1 sm:flex-initial min-h-10 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
            view === 'library'
              ? isDark
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-900 shadow-xs'
              : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Profile Library</span>
          <span className="font-mono tabular-nums opacity-75">({library.length})</span>
        </button>
        <button
          onClick={() => onChangeView('orders')}
          className={`flex-1 sm:flex-initial min-h-10 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
            view === 'orders'
              ? isDark
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-900 shadow-xs'
              : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          <span>Production Orders</span>
          <span className="font-mono tabular-nums opacity-75">({visibleOrders.length})</span>
        </button>
      </div>

      {/* Tab 1: Library View */}
      {view === 'library' ? (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {library.map((profile) => {
              const legs = profile.segments.map(s => ({
                id: s.id,
                lengthMm: s.lengthMm,
                interiorAngleDeg: s.angleDeg,
                turnDirection: s.turnDirection,
                kind: (s.kind === 'hem' ? 'open_hem' : s.kind) as any
              }));
              const eng = calculateFlashingEngineering(legs, 'vitor_055', 3.0, 1);

              return (
                <article
                  key={profile.id}
                  className={`rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                    isDark
                      ? 'border-slate-800 bg-[#0b101d] hover:border-slate-700'
                      : 'border-slate-200 bg-white shadow-2xs hover:border-slate-400'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={`text-[11px] font-medium flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          <span className="truncate">{profile.category || 'Architectural Flashing'}</span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-mono font-bold tabular-nums shrink-0 ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                            {eng.girthTier}
                          </span>
                        </div>
                        <h3 className={`font-bold text-sm mt-0.5 truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {profile.name}
                        </h3>
                      </div>
                    </div>

                    <div className="mt-3">
                      <ProfileThumbnail profile={profile} dark={isDark} />
                    </div>

                    {/* Engineering Dimensions Strip */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                      <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                        <span className={`block text-[10px] font-sans ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Nominal Leg Sum
                        </span>
                        <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          {eng.nominalSumMm} mm
                        </span>
                      </div>
                      <div className={`p-2 rounded-lg border ${isDark ? 'bg-emerald-950/35 border-emerald-800/50' : 'bg-emerald-50 border-emerald-100'}`}>
                        <span className={`block text-[10px] font-sans font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                          True Blank Width
                        </span>
                        <span className={`font-bold ${isDark ? 'text-emerald-200' : 'text-emerald-950'}`}>
                          {eng.developedBlankWidthMm} mm
                        </span>
                      </div>
                    </div>

                    {/* Segments inline summary */}
                    <p className={`mt-2.5 text-[11px] font-mono tabular-nums leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {profile.segments
                        .map((segment, index) =>
                          `L${index + 1} ${segment.lengthMm}mm${index < profile.segments.length - 1 ? ` @ ${segment.angleDeg}°` : ''}`
                        )
                        .join(' · ')}
                    </p>
                  </div>

                  {/* Actions */}
                  <div
                    className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs ${
                      isDark ? 'border-slate-800' : 'border-slate-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setCutSheetModalProfile({
                        profile,
                        pieceCount: 4,
                        pieceLengthLm: 3.0,
                        orderNotes: `Standard 12lm run for ${profile.name}`
                      })}
                      className={`min-h-9 px-2 py-1.5 font-semibold text-xs flex items-center gap-1.5 cursor-pointer rounded-lg transition-colors ${
                        isDark
                          ? 'text-sky-400 hover:bg-slate-800'
                          : 'text-sky-700 hover:text-sky-900 hover:bg-slate-50'
                      }`}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cut Sheet</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickOrderProfile(profile)}
                        className={`min-h-9 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                          isDark
                            ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        <span>Order</span>
                      </button>

                      <button
                        onClick={() => openLibraryProfile(profile)}
                        className={`min-h-9 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow-2xs transition-colors ${
                          isDark
                            ? 'bg-slate-100 text-slate-950 hover:bg-white'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Draw / Edit</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        /* Tab 2: Orders View */
        <section className="space-y-4">
          {/* Plan Flashing Pins Import Banner */}
          {Boolean(project?.flashingPins?.length) && (
            <div
              className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                isDark
                  ? 'bg-amber-950/40 border-amber-700/60 text-amber-100'
                  : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-amber-900/60 text-amber-300' : 'bg-amber-100 text-amber-800'}`}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold block">Architectural Plan Flashing Pins Available</span>
                  <span className={`text-[11px] ${isDark ? 'text-amber-300/80' : 'text-amber-800'}`}>
                    {project?.flashingPins?.length} callout pins are pinned to the drawing takeoff (
                    {project?.flashingPins?.reduce((acc, p) => acc + (p.lengthLm || 0), 0).toFixed(1)} lm total).
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleImportPlanPins}
                className="min-h-10 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shrink-0 cursor-pointer shadow-2xs flex items-center justify-center gap-1.5 transition-colors self-stretch sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Import all {project?.flashingPins?.length} Pins</span>
              </button>
            </div>
          )}

          {/* Order Form */}
          <form
            onSubmit={addOrderLine}
            className={`rounded-2xl border p-4 space-y-3 ${
              isDark
                ? 'border-slate-800 bg-[#0b101d] text-slate-100'
                : 'border-slate-200 bg-white text-slate-900 shadow-2xs'
            }`}
          >
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b pb-2.5 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <ShoppingCart className={`h-4 w-4 ${isDark ? 'text-sky-400' : 'text-sky-700'}`} />
                <h3 className="font-bold text-sm">Add Production Order Line</h3>
              </div>
              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Calculates blank width &amp; brake folding sequence
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className={`block font-semibold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Select Profile *
                </label>
                <select
                  value={orderProfileId}
                  onChange={(e) => setOrderProfileId(e.target.value)}
                  className={`w-full min-h-10 px-3 py-2 border rounded-xl font-bold ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  {library.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.segments.length} legs · blank {developedLength(p)}mm)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block font-semibold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Quantity (pcs) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={`w-full min-h-10 px-3 py-2 border rounded-xl font-mono font-bold tabular-nums ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className={`block font-semibold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Piece Length (m) *
                </label>
                <input
                  type="number"
                  min="0.5"
                  max="12.0"
                  step="0.1"
                  required
                  value={pieceLengthLm}
                  onChange={(e) => setPieceLengthLm(e.target.value)}
                  className={`w-full min-h-10 px-3 py-2 border rounded-xl font-mono font-bold tabular-nums ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block font-semibold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Location / Mitre Notes
              </label>
              <input
                type="text"
                placeholder="e.g. North Gable Rake · FlaxPod · 150mm upstand"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className={`w-full min-h-10 px-3 py-2 border rounded-xl text-xs ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className={`flex flex-wrap items-center justify-between gap-3 pt-2 border-t text-xs ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <span className={`font-mono tabular-nums ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Total Required:{' '}
                <strong className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {((Number(quantity) || 0) * (Number(pieceLengthLm) || 0)).toFixed(1)} linear metres
                </strong>
              </span>
              <button
                type="submit"
                className={`min-h-10 px-4 py-2 font-bold rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 ${
                  isDark
                    ? 'bg-sky-600 hover:bg-sky-500 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Order</span>
              </button>
            </div>

            {orderMessage && (
              <p className={`text-xs font-semibold mt-1 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                {orderMessage}
              </p>
            )}
          </form>

          {/* Order Lines Register */}
          <div
            className={`rounded-2xl border overflow-hidden ${
              isDark
                ? 'border-slate-800 bg-[#0b101d] text-slate-100'
                : 'border-slate-200 bg-white text-slate-900 shadow-2xs'
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-xs font-bold ${
                isDark
                  ? 'border-slate-800 bg-slate-900/70 text-slate-100'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span>Production Order Lines ({visibleOrders.length})</span>
                <span aria-hidden="true" className="opacity-40">·</span>
                <span className={`font-mono tabular-nums ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {visibleOrders.reduce((acc, l) => acc + l.totalLinearMetres, 0).toFixed(1)} Total Linear Metres
                </span>
              </div>
              <button
                type="button"
                onClick={handlePushOrdersToJob}
                disabled={visibleOrders.length === 0}
                className="min-h-9 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-45 text-white font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Push to Job Orders</span>
              </button>
            </div>

            {visibleOrders.length === 0 ? (
              <div className={`p-8 text-center text-xs space-y-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <p>No flashing order lines placed yet. Pick a profile above or draw a custom flashing from the Library tab.</p>
              </div>
            ) : (
              <div className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {visibleOrders.map((line) => {
                  const orderedProfile = library.find((p) => p.id === line.profileId);
                  return (
                    <div key={line.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-24 sm:w-32 shrink-0">
                          {orderedProfile ? (
                            <ProfileThumbnail profile={orderedProfile} dark={isDark} />
                          ) : (
                            <div className={`h-16 rounded-lg flex items-center justify-center text-[10px] ${isDark ? 'bg-slate-900 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                              Profile
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {line.profileName}
                            </h4>
                            <span className={`font-mono text-[11px] tabular-nums ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                              · {line.girthTier || '301-450mm'}
                            </span>
                          </div>
                          <p className={`mt-0.5 font-mono tabular-nums ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            {line.quantity} pcs × {line.pieceLengthLm} m ={' '}
                            <strong className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {line.totalLinearMetres} lm
                            </strong>
                          </p>
                          {line.notes && (
                            <p className={`text-[11px] mt-0.5 break-words ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {line.notes}
                            </p>
                          )}
                          <p className={`text-[11px] font-mono mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            <span className={isDark ? 'text-emerald-400 font-semibold' : 'text-emerald-700 font-semibold'}>
                              {line.status}
                            </span>
                            {' · '}
                            {new Date(line.createdAt).toLocaleDateString('en-NZ')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 shrink-0">
                        {orderedProfile && (
                          <button
                            type="button"
                            onClick={() => setCutSheetModalProfile({
                              profile: orderedProfile,
                              pieceCount: line.quantity,
                              pieceLengthLm: line.pieceLengthLm,
                              orderNotes: line.notes
                            })}
                            className={`min-h-9 px-3 py-1.5 rounded-xl border font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                              isDark
                                ? 'border-slate-700 bg-slate-900 text-sky-400 hover:bg-slate-800'
                                : 'border-slate-200 bg-white text-sky-800 hover:bg-slate-50'
                            }`}
                          >
                            <Printer className="w-3.5 h-3.5" /> Cut Sheet
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeOrderLine(line.id)}
                          className={`min-h-9 min-w-9 flex items-center justify-center rounded-xl cursor-pointer transition-colors ${
                            isDark
                              ? 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'
                          }`}
                          title="Remove line"
                          aria-label="Remove order line"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Workshop Fabrication Cut Sheet Modal */}
      {cutSheetModalProfile && cutSheetEngineering && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-4 sm:p-6 space-y-4 text-xs text-slate-900 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 gap-2">
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-bold text-sky-700 uppercase">
                  Workshop Sheet · Brake Press Specification
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5 truncate">
                  {cutSheetModalProfile.profile.name}
                </h3>
                <p className="text-slate-500 text-[11px] truncate">
                  Project: {project?.projectNumber || 'ARCH-2026-041'} ({project?.title || 'Matakana Coastal Ridge'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCutSheetModalProfile(null)}
                className="min-h-9 min-w-9 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg"
                aria-label="Close cut sheet"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Large Cross-Section Drawing */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center">
              <ProfileThumbnail profile={cutSheetModalProfile.profile} large />
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 font-mono text-[11px] tabular-nums">
                <span className="text-slate-600">
                  Nominal Sum: <strong>{cutSheetEngineering.nominalSumMm}mm</strong>
                </span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span className="text-emerald-700 font-bold">
                  True Blank: {cutSheetEngineering.developedBlankWidthMm}mm (BD: -{cutSheetEngineering.totalBendDeductionMm}mm)
                </span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span className="text-sky-800 font-bold">
                  {cutSheetEngineering.girthTier}
                </span>
              </div>
            </div>

            {/* Material & Coil Specification */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block text-[9px] font-sans">Material Spec</span>
                <span className="font-bold text-slate-900">{cutSheetEngineering.materialSpec.name}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block text-[9px] font-sans">Thickness / Gauge</span>
                <span className="font-bold text-slate-900">{cutSheetEngineering.materialSpec.thicknessMm} mm</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block text-[9px] font-sans">Coil Slit Width</span>
                <span className="font-bold text-slate-900">{cutSheetEngineering.recommendedSlitWidthMm} mm</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block text-[9px] font-sans">Total Weight</span>
                <span className="font-bold text-slate-900">{cutSheetEngineering.totalWeightKg} kg</span>
              </div>
            </div>

            {/* Step-by-Step Folding Sequence Table */}
            <div>
              <h4 className="font-bold text-slate-900 uppercase tracking-wide text-xs mb-2">
                Folding Sequence Table (Operator Instructions)
              </h4>
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full min-w-[520px] text-left font-mono text-xs tabular-nums">
                  <thead className="bg-slate-100 text-slate-700 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Step</th>
                      <th className="py-2 px-3">Fold Type</th>
                      <th className="py-2 px-3 text-center">Direction</th>
                      <th className="py-2 px-3 text-right">Angle</th>
                      <th className="py-2 px-3 text-right">Backgauge</th>
                      <th className="py-2 px-3 font-sans">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cutSheetEngineering.bendSteps.map((step) => (
                      <tr key={step.stepNumber} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-slate-900">{step.stepNumber}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{step.foldType}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${step.bendDirection === 'UP' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                            {step.bendDirection}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{step.bendAngleDeg}°</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-700">{step.stopPositionMm} mm</td>
                        <td className="py-2 px-3 font-sans text-slate-600 text-[11px]">{step.notes}</td>
                      </tr>
                    ))}
                    {cutSheetEngineering.bendSteps.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-400">
                          Single flat leg profile — no bends required.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cut Sheet Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                Order: {cutSheetModalProfile.pieceCount} pcs × {cutSheetModalProfile.pieceLengthLm}m = {cutSheetEngineering.totalLinearMetres} lm
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cutSheetEngineering, null, 2));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", `${cutSheetModalProfile.profile.name.replace(/\s+/g, '_')}_CAD_SPEC.json`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                  }}
                  className="min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-9 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Cut Sheet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};