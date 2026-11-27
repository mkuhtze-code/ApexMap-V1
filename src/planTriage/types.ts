export type TriageWindZone = 'L' | 'M' | 'H' | 'VH' | 'EH';
export type TriageVentedRidge = 'none' | 'RV10P';
export type TriageEdgeType = 'eave' | 'gable' | 'wall' | 'apron' | 'unclassified';
export type TriageSkeletonType = 'ridge' | 'hip' | 'valley';

export interface TriagePoint2D {
  x: number;
  y: number;
}

export interface EnvelopeIntentBody {
  id: string;
  outline: TriagePoint2D[];
  holes: TriagePoint2D[][];
  edges: Array<{
    type: TriageEdgeType;
    eaveHeightM?: number;
  }>;
  skeleton: Array<{
    type: TriageSkeletonType;
    from: TriagePoint2D;
    to: TriagePoint2D;
  }>;
  pitchDeg: number | null;
}

export interface EnvelopeIntentFlashingHint {
  detail: string;
  kind: string;
  coverMm: number | null;
  ventedRidge: TriageVentedRidge | null;
  notes?: string;
}

export interface EnvelopeIntentOpening {
  type: 'skylight' | 'penetration';
  center: TriagePoint2D;
}

export type TriagePageRole = 'site' | 'floor' | 'roof' | 'elevation' | 'other';

export interface EnvelopeIntentPageInfo {
  page: number;
  title: string;
  role: TriagePageRole;
  isRoofPlan: boolean;
  isDetailsSheet: boolean;
}

export interface EnvelopeIntent {
  fixtureId?: string;
  scope: 'roof_takeoff';
  scale: string | null;
  scaleSource?: 'printed' | 'user' | null;
  selectedPage?: number;
  pageCount?: number;
  pages?: EnvelopeIntentPageInfo[];
  units: 'm';
  north: 'up' | null;
  profileFamily: string | null;
  windZone: TriageWindZone | null;
  ventedRidge: TriageVentedRidge | null;
  eaveHeightM?: number | null;
  pitchDeg?: number | null;
  bodies: EnvelopeIntentBody[];
  flashingHints: EnvelopeIntentFlashingHint[];
  openings: EnvelopeIntentOpening[];
  evidence: Array<{ page: number; text: string }>;
  blockers: string[];
}
