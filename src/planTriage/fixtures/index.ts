export { buildR01FixturePdfBytes, type R01FixtureBuildOptions } from './generateR01FixturePdf';
export { buildR02FixturePdfBytes, type R02FixtureBuildOptions } from './generateR02FixturePdf';
export { buildR03FixturePdfBytes } from './generateR03FixturePdf';
export { buildR04FixturePdfBytes } from './generateR04FixturePdf';
export { buildR05FixturePdfBytes } from './generateR05FixturePdf';
export { buildR06FixturePdfBytes } from './generateR06FixturePdf';
export {
  buildR07FixturePdfBytes,
  type R07FixtureBuildOptions,
  type R07ScaleFailureMode
} from './generateR07FixturePdf';
export { buildR08FixturePdfBytes, type R08FixtureBuildOptions } from './generateR08FixturePdf';
export { buildR09FixturePdfBytes } from './generateR09FixturePdf';
export { buildR10FixturePdfBytes } from './generateR10FixturePdf';

export interface TriageFixtureCatalogEntry {
  id: 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R08' | 'R09' | 'R10';
  name: string;
  pdfFile: string;
  goldenIntentFile: string;
  focus: string;
}

export const PLAN_TRIAGE_FIXTURE_CATALOG: TriageFixtureCatalogEntry[] = [
  {
    id: 'R01',
    name: 'Simple Gable',
    pdfFile: 'ApexMap_TestPlan_R01.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R01.intent.json',
    focus: 'Baseline 12x7 m gable roof, 1 ridge, 22.5° pitch, FD-01, scale 1:100'
  },
  {
    id: 'R02',
    name: 'Classic L-Shape',
    pdfFile: 'ApexMap_TestPlan_R02.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R02.intent.json',
    focus: '6-vertex L-shape 14x10 m, main-wing ridge, mixed eave/gable edges'
  },
  {
    id: 'R03',
    name: 'Full Hip Roof',
    pdfFile: 'ApexMap_TestPlan_R03.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R03.intent.json',
    focus: '12x8 m hip roof, 1 central ridge + 4 corner hips, all eave perimeter, Wind H'
  },
  {
    id: 'R04',
    name: 'Mono-Pitch / Skillion',
    pdfFile: 'ApexMap_TestPlan_R04.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R04.intent.json',
    focus: '11x7 m mono-pitch 8°, empty skeleton, HIGH EAVE (3.2m) / LOW EAVE (2.4m)'
  },
  {
    id: 'R05',
    name: 'Hip + Valley T-Shape',
    pdfFile: 'ApexMap_TestPlan_R05.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R05.intent.json',
    focus: '8-vertex 16x12 m T-shape with 2 ridges, 6 hips, 2 internal valleys, Wind VH'
  },
  {
    id: 'R06',
    name: 'Real Multi-Page Plan Set',
    pdfFile: 'ApexMap_TestPlan_R06.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R06.intent.json',
    focus: '5-page set (Site/Floor/Roof/Elev/Details): picks Roof p.3, Wind VH p.1, ignores HIRB 45°'
  },
  {
    id: 'R07',
    name: 'Missing / Ambiguous Scale',
    pdfFile: 'ApexMap_TestPlan_R07.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R07.intent.json',
    focus: 'Missing/conflicting/scale-bar-only blockers until user supplies manualScaleDenom'
  },
  {
    id: 'R08',
    name: 'Floor-Plan Proxy Only',
    pdfFile: 'ApexMap_TestPlan_R08.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R08.intent.json',
    focus: 'Critical safety gate: floor plan internal partition walls emit empty skeleton []'
  },
  {
    id: 'R09',
    name: 'Penetrations & Courtyard',
    pdfFile: 'ApexMap_TestPlan_R09.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R09.intent.json',
    focus: '14x10 m perimeter with 4x4 m courtyard void hole + skylight & penetration openings'
  },
  {
    id: 'R10',
    name: 'Coastal Standing Seam',
    pdfFile: 'ApexMap_TestPlan_R10.pdf',
    goldenIntentFile: 'ApexMap_TestPlan_R10.intent.json',
    focus: '18x9 m Standing Seam @ 1:200, Wind EH, RV10P, FD-02 225mm, rotated North (null)'
  }
];
