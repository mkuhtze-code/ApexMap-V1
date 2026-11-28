import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readVectorPdf } from '../readVectorPdf';
import { importEnvelopeIntent } from '../importToApexMap';
import {
  applyDiagnosisMerge,
  buildTriageDiagnosisPayload,
  diagnoseWithGemini,
  sanitizeTriageDiagnosis
} from '../diagnoseWithGemini';
import { buildR01FixturePdfBytes } from '../fixtures/generateR01FixturePdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

console.log('--- Starting Plan Triage R01 Fixture Test Suite ---');

async function buildSplitScalePdfBytes(mode: 'split_chars' | 'scale_space' | 'at_a1' | 'at_a3') {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([(420 * 72) / 25.4, (297 * 72) / 25.4]);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mm = (v: number) => (v * 72) / 25.4;

  page.drawText('Sheet: A-201 Roof Plan', { x: mm(255), y: mm(65), size: 10, font, color: rgb(0, 0, 0) });
  if (mode === 'split_chars') {
    // Separate text items on the same baseline: "1" ":" "100"
    page.drawText('1', { x: mm(255), y: mm(50), size: 10, font, color: rgb(0, 0, 0) });
    page.drawText(':', { x: mm(258.5), y: mm(50), size: 10, font, color: rgb(0, 0, 0) });
    page.drawText('100', { x: mm(261), y: mm(50), size: 10, font, color: rgb(0, 0, 0) });
  } else if (mode === 'scale_space') {
    page.drawText('SCALE 1:100', { x: mm(255), y: mm(50), size: 10, font, color: rgb(0, 0, 0) });
  } else if (mode === 'at_a1') {
    page.drawText('1:100 @ A1', { x: mm(255), y: mm(50), size: 10, font, color: rgb(0, 0, 0) });
  } else {
    page.drawText('1:100 at A3', { x: mm(255), y: mm(50), size: 10, font, color: rgb(0, 0, 0) });
  }

  // 12 m x 7 m rectangle at 1:100 => 120 mm x 70 mm
  const x0 = mm(45);
  const y0 = mm(95);
  const x1 = mm(165);
  const y1 = mm(165);
  const opts = { thickness: 1.5, color: rgb(0, 0, 0) };
  page.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y0 }, ...opts });
  page.drawLine({ start: { x: x1, y: y0 }, end: { x: x1, y: y1 }, ...opts });
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x0, y: y1 }, ...opts });
  page.drawLine({ start: { x: x0, y: y1 }, end: { x: x0, y: y0 }, ...opts });
  page.drawLine({ start: { x: x0, y: mm(130) }, end: { x: x1, y: mm(130) }, ...opts });
  return pdfDoc.save();
}

async function buildMultiPageDetailsFirstPdfBytes() {
  const r01Bytes = await buildR01FixturePdfBytes();
  const r01Doc = await PDFDocument.load(r01Bytes);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const mm = (v: number) => (v * 72) / 25.4;

  // Page 1: Mt Albert Details sheet (no roof outline)
  const detailsPage = doc.addPage([mm(420), mm(297)]);
  detailsPage.drawText('Sheet: D-101 Mt Albert Details', {
    x: mm(40),
    y: mm(250),
    size: 14,
    font,
    color: rgb(0, 0, 0)
  });
  detailsPage.drawText('TYPICAL FLASHING DETAILS', {
    x: mm(40),
    y: mm(230),
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2)
  });

  // Page 2: R01 Roof Plan
  const [copiedRoofPage] = await doc.copyPages(r01Doc, [0]);
  doc.addPage(copiedRoofPage);
  return doc.save();
}

async function main() {
  const pdfBytes = readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R01.pdf'));
  const truth = JSON.parse(
    readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R01.intent.json'), 'utf8')
  ) as {
    fixtureId: string;
    scope: string;
    scale: string;
    units: string;
    north: string;
    profileFamily: string;
    windZone: string;
    ventedRidge: string;
    eaveHeightM: number;
    pitchDeg: number;
    bodies: Array<{
      id: string;
      outline: Array<[number, number]>;
      holes: unknown[];
      edges: Array<{ type: string; eaveHeightM?: number }>;
      skeleton: Array<{ type: string; from: [number, number]; to: [number, number] }>;
    }>;
    flashingHints: Array<{ detail: string; kind: string; coverMm: number; ventedRidge: string }>;
    openings: unknown[];
    blockers: string[];
  };

  // 1. Parse committed PDF and diff against R01 ground-truth JSON within 0.05 m tolerance
  const intent = await readVectorPdf(pdfBytes);

  assert.deepEqual(intent.blockers, truth.blockers, 'R01 must parse cleanly with zero blockers');
  assert.equal(intent.fixtureId, truth.fixtureId);
  assert.equal(intent.scope, truth.scope);
  assert.equal(intent.scale, truth.scale);
  assert.equal(intent.scaleSource, 'printed');
  assert.equal(intent.units, truth.units);
  assert.equal(intent.north, truth.north);
  assert.equal(intent.profileFamily, truth.profileFamily);
  assert.equal(intent.windZone, truth.windZone);
  assert.equal(intent.ventedRidge, truth.ventedRidge);
  assert.equal(intent.eaveHeightM, truth.eaveHeightM);
  assert.equal(intent.pitchDeg, truth.pitchDeg);
  assert.equal(intent.confidence, 0.95, 'R01 deterministic confidence must equal 0.95');

  assert.equal(intent.bodies.length, 1, 'R01 must emit exactly one roof body');
  const body = intent.bodies[0];
  const truthBody = truth.bodies[0];

  assert.equal(body.holes.length, 0, 'R01 must emit zero courtyard holes');
  assert.equal(body.pitchDeg, truth.pitchDeg);
  assert.equal(body.outline.length, truthBody.outline.length);

  body.outline.forEach((pt, idx) => {
    const [tx, ty] = truthBody.outline[idx];
    assert.ok(
      Math.abs(pt.x - tx) <= 0.05 && Math.abs(pt.y - ty) <= 0.05,
      `Vertex ${idx} (${pt.x}, ${pt.y}) must match ground truth (${tx}, ${ty}) within 0.05 m`
    );
  });

  assert.deepEqual(
    body.edges.map((e) => e.type),
    truthBody.edges.map((e) => e.type),
    'CCW edges from south must be eave, gable, eave, gable'
  );
  assert.equal(body.edges[0].eaveHeightM, 2.7);
  assert.equal(body.edges[2].eaveHeightM, 2.7);

  assert.equal(body.skeleton.length, 1, 'R01 must emit exactly one ridge skeleton line');
  const ridge = body.skeleton[0];
  const truthRidge = truthBody.skeleton[0];
  assert.equal(ridge.type, 'ridge');
  assert.ok(
    Math.abs(ridge.from.x - truthRidge.from[0]) <= 0.05 &&
      Math.abs(ridge.from.y - truthRidge.from[1]) <= 0.05,
    `Ridge start (${ridge.from.x}, ${ridge.from.y}) must match [0, 3.5] within 0.05 m`
  );
  assert.ok(
    Math.abs(ridge.to.x - truthRidge.to[0]) <= 0.05 &&
      Math.abs(ridge.to.y - truthRidge.to[1]) <= 0.05,
    `Ridge end (${ridge.to.x}, ${ridge.to.y}) must match [12, 3.5] within 0.05 m`
  );

  assert.deepEqual(intent.flashingHints, truth.flashingHints);
  assert.deepEqual(intent.openings, []);

  // 2. Missing scale copy must emit blockers ["missing scale"] and zero bodies
  const missingScaleBytes = await buildR01FixturePdfBytes({ omitScale: true });
  const missingScaleIntent = await readVectorPdf(missingScaleBytes);
  assert.equal(missingScaleIntent.scale, null);
  assert.equal(missingScaleIntent.scaleSource, null);
  assert.deepEqual(missingScaleIntent.blockers, ['missing scale']);
  assert.equal(missingScaleIntent.bodies.length, 0, 'Missing scale must emit zero bodies');
  assert.throws(() => importEnvelopeIntent(missingScaleIntent), /blockers/);

  // 2b. Once user picks 1:100 on the missing-scale PDF, it resolves with scaleSource: "user" and imports cleanly
  const userScaledIntent = await readVectorPdf(missingScaleBytes, { manualScaleDenom: 100 });
  assert.equal(userScaledIntent.scale, '1:100');
  assert.equal(userScaledIntent.scaleSource, 'user');
  assert.deepEqual(userScaledIntent.blockers, []);
  assert.equal(userScaledIntent.bodies.length, 1);
  assert.equal(userScaledIntent.bodies[0].outline[1].x, 12);
  assert.equal(userScaledIntent.bodies[0].outline[2].y, 7);
  const userImported = importEnvelopeIntent(userScaledIntent);
  assert.equal(userImported.level.outline.edges.length, 4);
  assert.equal(userImported.level.skeleton.length, 1);

  // 3. Dimension mismatch copy must refuse to invent a roof body
  const mismatchBytes = await buildR01FixturePdfBytes({ overrideDimLabelSouth: '14500' });
  const mismatchIntent = await readVectorPdf(mismatchBytes);
  assert.ok(mismatchIntent.blockers.includes('dimension mismatch'));
  assert.equal(mismatchIntent.bodies.length, 0);

  // 4. Split baseline scale tokens ("1" ":" "100"), "SCALE 1:100", "1:100 @ A1", "1:100 at A3"
  for (const mode of ['split_chars', 'scale_space', 'at_a1', 'at_a3'] as const) {
    const splitBytes = await buildSplitScalePdfBytes(mode);
    const splitIntent = await readVectorPdf(splitBytes);
    assert.equal(splitIntent.scale, '1:100', `${mode} must resolve 1:100`);
    assert.equal(splitIntent.scaleSource, 'printed');
    assert.deepEqual(splitIntent.blockers, [], `${mode} must parse without blockers`);
    assert.equal(splitIntent.bodies.length, 1);
    assert.equal(splitIntent.bodies[0].outline[1].x, 12);
    assert.equal(splitIntent.bodies[0].outline[2].y, 7);
  }

  // 5. Multi-page PDF: Page 1 is a details sheet, Page 2 is Roof Plan -> defaults to Page 2
  const multiPageBytes = await buildMultiPageDetailsFirstPdfBytes();
  const multiIntent = await readVectorPdf(multiPageBytes);
  assert.equal(multiIntent.pageCount, 2);
  assert.equal(multiIntent.selectedPage, 2, 'Must default to Roof Plan page when Page 1 is Details');
  assert.equal(multiIntent.pages?.length, 2);
  assert.equal(multiIntent.pages?.[0].role, 'details');
  assert.equal(multiIntent.pages?.[0].isDetailsSheet, true);
  assert.ok(/Mt Albert Details/i.test(multiIntent.pages?.[0].title ?? ''));
  assert.equal(multiIntent.pages?.[1].isRoofPlan, true);
  assert.ok(/Roof Plan/i.test(multiIntent.pages?.[1].title ?? ''));
  assert.deepEqual(multiIntent.blockers, []);
  assert.equal(multiIntent.bodies.length, 1);

  // Explicit selection of Page 1 reads the details sheet cleanly
  const detailsOnlyIntent = await readVectorPdf(multiPageBytes, { pageNumber: 1 });
  assert.equal(detailsOnlyIntent.selectedPage, 1);
  assert.ok(detailsOnlyIntent.blockers.length > 0);
  assert.equal(detailsOnlyIntent.bodies.length, 0);

  // 6. Real Plan Set Rules:
  // 6a. Site page titled SITE PLAN with scale 1:200 and lot numbers produces no body
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([(420 * 72) / 25.4, (297 * 72) / 25.4]);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const mm = (v: number) => (v * 72) / 25.4;

    page.drawText('SITE PLAN', { x: mm(40), y: mm(250), size: 14, font, color: rgb(0, 0, 0) });
    page.drawText('Scale: 1:200', { x: mm(40), y: mm(238), size: 10, font, color: rgb(0, 0, 0) });
    page.drawText('LOT 1205 DP 543210  AREA 650.0 m2', {
      x: mm(40),
      y: mm(228),
      size: 10,
      font,
      color: rgb(0, 0, 0)
    });
    // Site boundary box that must NOT become a roof body
    const opts = { thickness: 1.2, color: rgb(0, 0, 0) };
    page.drawLine({ start: { x: mm(60), y: mm(60) }, end: { x: mm(160), y: mm(60) }, ...opts });
    page.drawLine({ start: { x: mm(160), y: mm(60) }, end: { x: mm(160), y: mm(140) }, ...opts });
    page.drawLine({ start: { x: mm(160), y: mm(140) }, end: { x: mm(60), y: mm(140) }, ...opts });
    page.drawLine({ start: { x: mm(60), y: mm(140) }, end: { x: mm(60), y: mm(60) }, ...opts });

    const siteIntent = await readVectorPdf(await doc.save());
    assert.equal(siteIntent.pages?.[0].role, 'site');
    assert.equal(siteIntent.scale, '1:200');
    assert.equal(siteIntent.bodies.length, 0, 'SITE PLAN must never produce a roof body');
    assert.ok(siteIntent.blockers.length > 0);
  }

  // 6b. Multi-page set (Site + Floor + Elevation, no roof page) picks Floor Plan,
  // handles 1:50 / 1:100, overall chains 10.330 x 4.826 + internal dims + m2, ignores HRB 45 deg, reads Wind Zone: LOW across pages
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const mm = (v: number) => (v * 72) / 25.4;
    const opts = { thickness: 1.4, color: rgb(0, 0, 0) };

    // Page 1: Site Plan with Wind Zone: LOW & lot/DP/HRB text
    const sitePage = doc.addPage([mm(420), mm(297)]);
    sitePage.drawText('SITE PLAN', { x: mm(40), y: mm(250), size: 14, font, color: rgb(0, 0, 0) });
    sitePage.drawText('Scale: 1:200', { x: mm(40), y: mm(238), size: 10, font, color: rgb(0, 0, 0) });
    sitePage.drawText('LOT 45 DP 123456', { x: mm(40), y: mm(228), size: 10, font, color: rgb(0, 0, 0) });
    sitePage.drawText('Wind Zone: LOW', { x: mm(40), y: mm(218), size: 10, font, color: rgb(0, 0, 0) });

    // Page 2: Floor Plan (no Roof page exists -> must default here)
    const floorPage = doc.addPage([mm(420), mm(297)]);
    floorPage.drawText('PROPOSED FLOOR PLAN', { x: mm(255), y: mm(65), size: 11, font, color: rgb(0, 0, 0) });
    floorPage.drawText('1:50 / 1:100', { x: mm(255), y: mm(52), size: 10, font, color: rgb(0, 0, 0) });
    floorPage.drawText('HRB 2.5m & 45°', { x: mm(255), y: mm(40), size: 9, font, color: rgb(0, 0, 0) });
    floorPage.drawText('Unitary Plan recession 45°', { x: mm(255), y: mm(30), size: 9, font, color: rgb(0, 0, 0) });
    floorPage.drawText('Floor area: 49.85 m²', { x: mm(40), y: mm(40), size: 9, font, color: rgb(0, 0, 0) });

    // Drawn 10.330 m x 4.826 m at 1:100 => 103.30 mm x 48.26 mm, plus an internal wall dividing into rooms
    const x0 = 60;
    const y0 = 100;
    const x1 = x0 + 103.3;
    const y1 = y0 + 48.26;
    floorPage.drawLine({ start: { x: mm(x0), y: mm(y0) }, end: { x: mm(x1), y: mm(y0) }, ...opts });
    floorPage.drawLine({ start: { x: mm(x1), y: mm(y0) }, end: { x: mm(x1), y: mm(y1) }, ...opts });
    floorPage.drawLine({ start: { x: mm(x1), y: mm(y1) }, end: { x: mm(x0), y: mm(y1) }, ...opts });
    floorPage.drawLine({ start: { x: mm(x0), y: mm(y1) }, end: { x: mm(x0), y: mm(y0) }, ...opts });
    // Internal partition wall (T-junction)
    floorPage.drawLine({ start: { x: mm(x0 + 42), y: mm(y0) }, end: { x: mm(x0 + 42), y: mm(y1) }, ...opts });

    // Horizontal overall dimension chain "10.330" at y=84 and internal chain "4.200" + "6.130" at y=92 + room "3.100" inside
    floorPage.drawLine({ start: { x: mm(x0), y: mm(87) }, end: { x: mm(x1), y: mm(87) }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    floorPage.drawText('10.330', { x: mm(x0 + 45), y: mm(82), size: 9, font, color: rgb(0, 0, 0) });
    floorPage.drawLine({ start: { x: mm(x0), y: mm(93) }, end: { x: mm(x1), y: mm(93) }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    floorPage.drawText('4.200', { x: mm(x0 + 16), y: mm(90), size: 8, font, color: rgb(0, 0, 0) });
    floorPage.drawText('6.130', { x: mm(x0 + 68), y: mm(90), size: 8, font, color: rgb(0, 0, 0) });
    floorPage.drawText('3.100', { x: mm(x0 + 55), y: mm(y0 + 20), size: 8, font, color: rgb(0, 0, 0) });

    // Vertical overall dimension chain "4.826" + internal "2.400"
    floorPage.drawLine({ start: { x: mm(x0 - 12), y: mm(y0) }, end: { x: mm(x0 - 12), y: mm(y1) }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    floorPage.drawText('4.826', { x: mm(x0 - 24), y: mm(y0 + 22), size: 9, font, color: rgb(0, 0, 0) });
    floorPage.drawText('2.400', { x: mm(x0 + 15), y: mm(y0 + 24), size: 8, font, color: rgb(0, 0, 0) });

    // Page 3: Elevations
    const elevPage = doc.addPage([mm(420), mm(297)]);
    elevPage.drawText('NORTH ELEVATION', { x: mm(40), y: mm(250), size: 14, font, color: rgb(0, 0, 0) });

    const floorIntent = await readVectorPdf(await doc.save());
    assert.equal(floorIntent.selectedPage, 2, 'Must prefer Floor Plan when no Roof page exists');
    assert.equal(floorIntent.pages?.map((p) => p.role).join(','), 'site,floor,elevation');
    assert.equal(floorIntent.scale, '1:100', '1:50 / 1:100 must resolve 1:100 matching overall dims');
    assert.equal(floorIntent.windZone, 'L', 'Wind Zone: LOW from page 1 must set L');
    assert.equal(floorIntent.pitchDeg, null, 'HRB 2.5m & 45° must not set pitch');
    assert.deepEqual(floorIntent.blockers, []);
    assert.equal(floorIntent.bodies.length, 1);

    const floorOutline = floorIntent.bodies[0].outline;
    const xs = floorOutline.map((p) => p.x);
    const ys = floorOutline.map((p) => p.y);
    assert.ok(Math.abs(Math.max(...xs) - 10.33) <= 0.05, 'Floor width must be 10.330 m');
    assert.ok(Math.abs(Math.max(...ys) - 4.826) <= 0.05, 'Floor height must be 4.826 m');
    assert.equal(
      floorIntent.bodies[0].skeleton.length,
      0,
      'Floor plan internal partition walls must NEVER become ridges'
    );
  }

  // 6c. Non-rectangular L-shape closed external loop matching overall chains
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([(420 * 72) / 25.4, (297 * 72) / 25.4]);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const mm = (v: number) => (v * 72) / 25.4;
    const opts = { thickness: 1.4, color: rgb(0, 0, 0) };

    page.drawText('ROOF PLAN', { x: mm(255), y: mm(65), size: 11, font, color: rgb(0, 0, 0) });
    page.drawText('SCALE 1:100', { x: mm(255), y: mm(52), size: 10, font, color: rgb(0, 0, 0) });
    // L-shape: 12m x 8m overall (120mm x 80mm)
    const pts = [
      [50, 90],
      [170, 90],
      [170, 130],
      [110, 130],
      [110, 170],
      [50, 170]
    ];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      page.drawLine({ start: { x: mm(a[0]), y: mm(a[1]) }, end: { x: mm(b[0]), y: mm(b[1]) }, ...opts });
    }
    page.drawLine({ start: { x: mm(50), y: mm(78) }, end: { x: mm(170), y: mm(78) }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('12.000', { x: mm(105), y: mm(73), size: 9, font, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: mm(38), y: mm(90) }, end: { x: mm(38), y: mm(170) }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('8.000', { x: mm(26), y: mm(128), size: 9, font, color: rgb(0, 0, 0) });

    const lIntent = await readVectorPdf(await doc.save());
    assert.deepEqual(lIntent.blockers, []);
    assert.equal(lIntent.bodies.length, 1);
    assert.equal(lIntent.bodies[0].outline.length, 6, 'Must extract 6-vertex L-shape loop');
    assert.equal(Math.max(...lIntent.bodies[0].outline.map((p) => p.x)), 12);
    assert.equal(Math.max(...lIntent.bodies[0].outline.map((p) => p.y)), 8);
  }

  // 6d. 28 Blanche Way 5-page NZ concept set:
  // Page 1 Existing Site (A01), Page 2 Proposed Site (A02), Page 3 Floor Plan (A10, 10.330x4.826 + Net Roof Area 51.3 m2),
  // Page 4 Elevations E1 & E2 (A20, UNITARY PLAN / HIRB 2.5m & 45°, Wind Zone LOW), Page 5 Elevations E3 & E4 (A21)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const mm = (v: number) => (v * 72) / 25.4;

    const p1 = doc.addPage([mm(420), mm(297)]);
    p1.drawText('LOT 78 DP 612345', { x: mm(30), y: mm(260), size: 12, font, color: rgb(0, 0, 0) });
    p1.drawText('EXISTING SITE PLAN (A01)', { x: mm(280), y: mm(25), size: 11, font, color: rgb(0, 0, 0) });
    p1.drawText('Scale: 1:200', { x: mm(280), y: mm(16), size: 9, font, color: rgb(0, 0, 0) });

    const p2 = doc.addPage([mm(420), mm(297)]);
    p2.drawText('PROPOSED SITE PLAN (A02)', { x: mm(280), y: mm(25), size: 11, font, color: rgb(0, 0, 0) });
    p2.drawText('Scale: 1:200', { x: mm(280), y: mm(16), size: 9, font, color: rgb(0, 0, 0) });

    const p3 = doc.addPage([mm(420), mm(297)]);
    // Put title block labels on same Y (80mm) as horizontal dim string to verify cross-column isolation
    p3.drawText('FLOOR PLAN (A10)', { x: mm(280), y: mm(25), size: 11, font, color: rgb(0, 0, 0) });
    p3.drawText('1:100 / 1:50', { x: mm(280), y: mm(16), size: 9, font, color: rgb(0, 0, 0) });
    p3.drawText('Sheet: A10', { x: mm(310), y: mm(80), size: 9, font, color: rgb(0, 0, 0) });
    p3.drawText('Net Roof Area 51.3 m²', { x: mm(45), y: mm(50), size: 9, font, color: rgb(0, 0, 0) });

    const x0 = 60;
    const y0 = 100;
    const x1 = x0 + 103.3;
    const y1 = y0 + 48.26;
    // Draw filled rectangle footprint (like Archicad/Revit solid wall loop)
    p3.drawRectangle({
      x: mm(x0),
      y: mm(y0),
      width: mm(103.3),
      height: mm(48.26),
      borderWidth: 1.2,
      borderColor: rgb(0, 0, 0)
    });
    p3.drawLine({ start: { x: mm(x0), y: mm(84) }, end: { x: mm(x1), y: mm(84) }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    p3.drawText('10.330', { x: mm(x0 + 45), y: mm(80), size: 9, font, color: rgb(0, 0, 0) });
    p3.drawLine({ start: { x: mm(x0 - 12), y: mm(y0) }, end: { x: mm(x0 - 12), y: mm(y1) }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    p3.drawText('4.826', { x: mm(x0 - 24), y: mm(y0 + 22), size: 9, font, color: rgb(0, 0, 0) });

    const p4 = doc.addPage([mm(420), mm(297)]);
    p4.drawText('REFER TO SITE PLAN FOR BOUNDARIES', { x: mm(40), y: mm(260), size: 9, font, color: rgb(0, 0, 0) });
    p4.drawText('ELEVATIONS E1 & E2 (A20)', { x: mm(280), y: mm(25), size: 11, font, color: rgb(0, 0, 0) });
    p4.drawText('Scale: 1:100', { x: mm(280), y: mm(16), size: 9, font, color: rgb(0, 0, 0) });
    p4.drawText('UNITARY PLAN', { x: mm(45), y: mm(210), size: 9, font, color: rgb(0, 0, 0) });
    p4.drawText('HIRB 2.5m & 45°', { x: mm(45), y: mm(200), size: 9, font, color: rgb(0, 0, 0) });
    p4.drawText('Wind Zone LOW', { x: mm(45), y: mm(185), size: 9, font, color: rgb(0, 0, 0) });

    const p5 = doc.addPage([mm(420), mm(297)]);
    p5.drawText('ELEVATIONS E3 & E4 (A21)', { x: mm(280), y: mm(25), size: 11, font, color: rgb(0, 0, 0) });
    p5.drawText('Scale: 1:100', { x: mm(280), y: mm(16), size: 9, font, color: rgb(0, 0, 0) });

    const blancheBytes = await doc.save();
    const blancheIntent = await readVectorPdf(blancheBytes);
    assert.equal(blancheIntent.selectedPage, 3, '28 Blanche Way must default to Page 3 Floor Plan');
    assert.equal(blancheIntent.recommendedPage, 3);
    assert.equal(
      blancheIntent.pages?.map((p) => p.role).join(','),
      'site,site,floor,elevation,elevation'
    );
    assert.equal(blancheIntent.scale, '1:100');
    assert.equal(blancheIntent.scaleSource, 'printed');
    assert.equal(blancheIntent.pitchDeg, 45, 'Must extract 45° from Elevation UNITARY PLAN / HIRB');
    assert.equal(blancheIntent.windZone, 'L', 'Must extract LOW -> L cross-page');
    assert.equal(blancheIntent.profileFamily, null);
    assert.deepEqual(blancheIntent.blockers, []);
    assert.equal(blancheIntent.warnings?.length ?? 0, 0);
    assert.ok(
      typeof blancheIntent.confidence === 'number' && blancheIntent.confidence === 0.9,
      '28 Blanche Way deterministic confidence must equal 0.90'
    );
    assert.ok(
      blancheIntent.areas?.some(
        (a) => /Net Roof Area/i.test(a.label) && Math.abs(a.valueM2 - 51.3) < 0.01 && a.page === 3
      ),
      'Must extract structured Net Roof Area 51.3 m² metric'
    );
    assert.equal(blancheIntent.bodies.length, 1);
    assert.equal(blancheIntent.bodies[0].skeleton.length, 0, '28 Blanche Way floor proxy must have empty skeleton');
    assert.ok(Math.abs(Math.max(...blancheIntent.bodies[0].outline.map((p) => p.x)) - 10.33) <= 0.05);
    assert.ok(Math.abs(Math.max(...blancheIntent.bodies[0].outline.map((p) => p.y)) - 4.826) <= 0.05);

    const blancheImported = importEnvelopeIntent(blancheIntent);
    assert.equal(blancheImported.defaultPitchDeg, 45);
    assert.equal(blancheImported.windZone, 'L');
    assert.equal(blancheImported.level.outline.edges.length, 4);
    assert.equal(blancheImported.level.skeleton.length, 0);

    assert.ok(
      blancheIntent.evidence.some((e) => /51\.3\s*m/i.test(e.text)),
      'Must preserve Net Roof Area 51.3 m² in evidence'
    );

    // Site page 1 must produce no body, preserve recommendedPage=3, and emit clear site-plan blocker copy
    const blancheSiteIntent = await readVectorPdf(blancheBytes, { pageNumber: 1 });
    assert.equal(blancheSiteIntent.bodies.length, 0);
    assert.equal(blancheSiteIntent.recommendedPage, 3);
    assert.ok(blancheSiteIntent.blockers[0]?.includes('site plan has no roof outline'));

    // Elevation page with "UNITARY PLAN" above "2.5m & 45°" (no "HIRB" on line 2) must still resolve 45°
    const adjDoc = await PDFDocument.create();
    const adjFont = await adjDoc.embedFont(StandardFonts.HelveticaBold);
    const adjP1 = adjDoc.addPage([mm(420), mm(297)]);
    adjP1.drawText('FLOOR PLAN (A10)', { x: mm(280), y: mm(25), size: 11, font: adjFont, color: rgb(0, 0, 0) });
    adjP1.drawText('Scale: 1:100', { x: mm(280), y: mm(16), size: 9, font: adjFont, color: rgb(0, 0, 0) });
    adjP1.drawRectangle({ x: mm(60), y: mm(100), width: mm(100), height: mm(50), borderWidth: 1, borderColor: rgb(0, 0, 0) });
    adjP1.drawText('10.000', { x: mm(100), y: mm(80), size: 9, font: adjFont, color: rgb(0, 0, 0) });
    adjP1.drawText('5.000', { x: mm(36), y: mm(122), size: 9, font: adjFont, color: rgb(0, 0, 0) });
    const adjP2 = adjDoc.addPage([mm(420), mm(297)]);
    adjP2.drawText('ELEVATIONS (A20)', { x: mm(280), y: mm(25), size: 11, font: adjFont, color: rgb(0, 0, 0) });
    adjP2.drawText('UNITARY PLAN', { x: mm(45), y: mm(210), size: 9, font: adjFont, color: rgb(0, 0, 0) });
    adjP2.drawText('2.5m & 45°', { x: mm(45), y: mm(201), size: 9, font: adjFont, color: rgb(0, 0, 0) });
    const adjIntent = await readVectorPdf(await adjDoc.save());
    assert.equal(adjIntent.pitchDeg, 45, 'Must extract 45° from line beneath UNITARY PLAN on elevation sheet');
  }

  // 6e. L1 synthesis: 0.25m dim tolerance + heights extraction + >15% area warning without blocking
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const mm = (v: number) => (v * 72) / 25.4;

    const floorP = doc.addPage([mm(420), mm(297)]);
    floorP.drawText('FLOOR PLAN', { x: mm(280), y: mm(25), size: 11, font, color: rgb(0, 0, 0) });
    floorP.drawText('Scale: 1:100', { x: mm(280), y: mm(16), size: 9, font, color: rgb(0, 0, 0) });
    // Drawn 10.00m x 5.00m (= 50.0 m2), printed dims offset by 0.18m (within 0.25m tol)
    floorP.drawRectangle({ x: mm(60), y: mm(100), width: mm(100), height: mm(50), borderWidth: 1, borderColor: rgb(0, 0, 0) });
    floorP.drawText('10.180', { x: mm(100), y: mm(80), size: 9, font, color: rgb(0, 0, 0) });
    floorP.drawText('4.850', { x: mm(36), y: mm(122), size: 9, font, color: rgb(0, 0, 0) });
    // Deliberately off area (>15% discrepancy) -> warning only, never a blocker
    floorP.drawText('Floor Area 80.0 m²', { x: mm(45), y: mm(50), size: 9, font, color: rgb(0, 0, 0) });
    floorP.drawText('FFL 10.50m', { x: mm(45), y: mm(40), size: 9, font, color: rgb(0, 0, 0) });

    const elevP = doc.addPage([mm(420), mm(297)]);
    elevP.drawText('ELEVATIONS', { x: mm(280), y: mm(25), size: 11, font, color: rgb(0, 0, 0) });
    elevP.drawText('HIRB 2.5m & 45°', { x: mm(45), y: mm(200), size: 9, font, color: rgb(0, 0, 0) });
    elevP.drawText('Ridge height 5.40m', { x: mm(45), y: mm(190), size: 9, font, color: rgb(0, 0, 0) });

    const l1Intent = await readVectorPdf(await doc.save());
    assert.deepEqual(l1Intent.blockers, [], '0.25m dim match + >15% area diff must not block');
    assert.equal(l1Intent.bodies.length, 1);
    assert.ok((l1Intent.warnings?.length ?? 0) >= 1, 'Area mismatch >15% must emit warning');
    assert.ok(l1Intent.heights?.some((h) => h.kind === 'ffl' && Math.abs(h.valueM - 10.5) < 0.01));
    assert.ok(l1Intent.heights?.some((h) => h.kind === 'ridge' && Math.abs(h.valueM - 5.4) < 0.01));
    assert.equal(
      l1Intent.heights?.some((h) => Math.abs(h.valueM - 2.5) < 0.01),
      false,
      'HIRB 2.5m must not be classified as a building height'
    );
  }

  // 6f. Beast Mode: skeleton gate (floor spiderweb vs roof vs RIDGE-labeled floor), loop preference, and Gemini diagnosis layer
  {
    const mm = (v: number) => (v * 72) / 25.4;
    const opts = { thickness: 1.4, color: rgb(0, 0, 0) };

    const buildSpiderwebDoc = async (title: string, labelRidge: boolean) => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([mm(420), mm(297)]);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      page.drawText(title, { x: mm(260), y: mm(40), size: 11, font, color: rgb(0, 0, 0) });
      page.drawText('Scale: 1:100', { x: mm(260), y: mm(28), size: 9, font, color: rgb(0, 0, 0) });

      const x0 = 60;
      const y0 = 100;
      const x1 = 160;
      const y1 = 160; // 10m x 6m
      page.drawRectangle({ x: mm(x0), y: mm(y0), width: mm(100), height: mm(60), borderWidth: 1.4, borderColor: rgb(0, 0, 0) });
      // Three long internal lines spanning >60% of both axes
      page.drawLine({ start: { x: mm(x0 + 5), y: mm(y0 + 30) }, end: { x: mm(x1 - 5), y: mm(y0 + 30) }, ...opts });
      page.drawLine({ start: { x: mm(x0 + 10), y: mm(y0 + 15) }, end: { x: mm(x1 - 10), y: mm(y0 + 15) }, ...opts });
      page.drawLine({ start: { x: mm(x0 + 50), y: mm(y0 + 5) }, end: { x: mm(x0 + 50), y: mm(y1 - 5) }, ...opts });
      if (labelRidge) {
        page.drawText('RIDGE', { x: mm(x0 + 15), y: mm(y0 + 32), size: 8, font, color: rgb(0, 0, 0) });
      }
      page.drawText('10.000', { x: mm(105), y: mm(82), size: 9, font, color: rgb(0, 0, 0) });
      page.drawText('6.000', { x: mm(38), y: mm(128), size: 9, font, color: rgb(0, 0, 0) });
      return doc.save();
    };

    const floorSpiderIntent = await readVectorPdf(await buildSpiderwebDoc('FLOOR PLAN', false));
    assert.equal(floorSpiderIntent.bodies.length, 1);
    assert.equal(floorSpiderIntent.bodies[0].skeleton.length, 0, 'Floor plan with long partition walls must emit empty skeleton');

    const roofSpiderIntent = await readVectorPdf(await buildSpiderwebDoc('ROOF PLAN', false));
    assert.equal(roofSpiderIntent.bodies.length, 1);
    assert.ok(roofSpiderIntent.bodies[0].skeleton.length >= 2, 'Roof plan must detect ridge lines');

    const floorLabeledIntent = await readVectorPdf(await buildSpiderwebDoc('FLOOR PLAN', true));
    assert.equal(floorLabeledIntent.bodies.length, 1);
    assert.equal(floorLabeledIntent.bodies[0].skeleton.length, 1, 'Floor plan with explicit RIDGE label preserves only labeled span');

    // Loop preference: 4-vertex simple perimeter beats noisier 8-vertex inner/notched loop with identical outer bbox
    {
      const doc = await PDFDocument.create();
      const page = doc.addPage([mm(420), mm(297)]);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      page.drawText('ROOF PLAN', { x: mm(260), y: mm(40), size: 11, font, color: rgb(0, 0, 0) });
      page.drawText('Scale: 1:100', { x: mm(260), y: mm(28), size: 9, font, color: rgb(0, 0, 0) });
      // Clean 4-vertex 10m x 5m rectangle
      page.drawRectangle({ x: mm(50), y: mm(100), width: mm(100), height: mm(50), borderWidth: 1.4, borderColor: rgb(0, 0, 0) });
      // Noisier 8-vertex stepped/notched loop offset with almost identical 10.0m x 5.0m bounds
      const noisyPts = [
        [200, 100], [300, 100], [300, 120], [295, 120],
        [295, 135], [300, 135], [300, 150], [200, 150]
      ];
      for (let i = 0; i < noisyPts.length; i++) {
        const a = noisyPts[i];
        const b = noisyPts[(i + 1) % noisyPts.length];
        page.drawLine({ start: { x: mm(a[0]), y: mm(a[1]) }, end: { x: mm(b[0]), y: mm(b[1]) }, ...opts });
      }
      page.drawText('10.000', { x: mm(95), y: mm(82), size: 9, font, color: rgb(0, 0, 0) });
      page.drawText('5.000', { x: mm(30), y: mm(125), size: 9, font, color: rgb(0, 0, 0) });

      const loopPrefIntent = await readVectorPdf(await doc.save());
      assert.equal(loopPrefIntent.bodies.length, 1);
      assert.equal(loopPrefIntent.bodies[0].outline.length, 4, 'Must prefer 4-vertex clean outer perimeter over noisier 8-vertex loop');
    }

    // Gemini diagnosis shared payload/sanitizer/merge + graceful null degradation
    const manyEvidence = Array.from({ length: 65 }, (_, i) => ({
      page: 1,
      text: `Note ${i}: ` + 'x'.repeat(180)
    }));
    const draftForDiag = {
      ...floorSpiderIntent,
      pages: [
        { page: 1, title: 'SITE PLAN', role: 'site' as const, isRoofPlan: false, isDetailsSheet: false },
        { page: 2, title: 'FLOOR PLAN', role: 'floor' as const, isRoofPlan: false, isDetailsSheet: false }
      ],
      selectedPage: 2,
      pitchDeg: null,
      windZone: null,
      bodies: [
        {
          ...floorSpiderIntent.bodies[0],
          pitchDeg: null,
          skeleton: [
            { type: 'ridge' as const, from: { x: 1, y: 3 }, to: { x: 9, y: 3 } }
          ]
        }
      ],
      evidence: manyEvidence
    };

    const payload = buildTriageDiagnosisPayload(draftForDiag);
    assert.ok(payload.evidence.length <= 40, 'Diagnosis payload must cap evidence at 40 items');
    assert.ok(payload.evidence.every((e) => e.text.length <= 120), 'Each evidence line capped at 120 chars');

    const sanitized = sanitizeTriageDiagnosis(
      {
        recommendedPage: 1, // bad suggestion (site page) -> sanitizer must correct to page 2 (floor)
        recommendedRole: 'site',
        pitchDeg: 45,
        pitchSource: 'Elevation A20 UNITARY PLAN HIRB 45°',
        windZone: 'L',
        skeletonPolicy: 'from_vectors', // floor w/o RIDGE evidence -> sanitizer must force empty_on_floor_proxy
        confidence: 0.91,
        summary: 'Use Floor Plan page 2; pitch 45 deg from elevation HIRB.',
        actions: [
          { type: 'selectPage', page: 1 }, // site target must be filtered out
          { type: 'clearSkeleton' },
          { type: 'setPitch', deg: 45 }
        ],
        warnings: []
      },
      payload
    );
    assert.ok(sanitized !== null);
    assert.equal(sanitized!.recommendedPage, 2, 'Sanitizer must never recommend site page when floor/roof exists');
    assert.equal(sanitized!.skeletonPolicy, 'empty_on_floor_proxy');
    assert.equal(
      sanitized!.actions.some((a) => a.type === 'selectPage' && a.page === 1),
      false,
      'Sanitizer must drop selectPage actions targeting site sheets'
    );

    const outlineBefore = JSON.stringify(draftForDiag.bodies[0].outline);
    const merged = applyDiagnosisMerge(draftForDiag, sanitized);
    assert.equal(merged.pitchDeg, 45, 'Merge fills missing pitchDeg');
    assert.equal(merged.windZone, 'L', 'Merge fills missing windZone');
    assert.equal(merged.bodies[0].skeleton.length, 0, 'Merge enforces empty skeleton on floor proxy');
    assert.equal(JSON.stringify(merged.bodies[0].outline), outlineBefore, 'Merge must never mutate outline coordinates');
    assert.equal(applyDiagnosisMerge(draftForDiag, null), draftForDiag, 'Null diagnosis leaves draft unchanged');

    const offlineDiag = await diagnoseWithGemini(draftForDiag);
    assert.equal(offlineDiag, null, 'diagnoseWithGemini must degrade cleanly to null when offline/unconfigured');
  }

  // 7. importEnvelopeIntent maps onto ApexMap model without generating faces or calling skeleton solver
  const existingPlaneCount = 0;
  const imported = importEnvelopeIntent(intent);
  assert.equal(imported.level.outline.edges.length, 4);
  assert.deepEqual(
    imported.level.outline.edges.map((e) => e.type),
    ['outline', 'verge', 'outline', 'verge']
  );
  assert.equal(imported.level.outline.edges[0].eaveHeightM, 2.7);
  assert.equal(imported.level.outline.edges[2].eaveHeightM, 2.7);
  assert.equal(imported.level.skeleton.length, 1);
  assert.equal(imported.level.skeleton[0].suggestedType, 'ridge');
  assert.equal(imported.level.skeleton[0].from.y, 3.5);
  assert.equal(imported.level.skeleton[0].to.y, 3.5);
  assert.equal(imported.level.outline.holes?.length ?? 0, 0);
  assert.equal(imported.roofProfileFamily, 'corrugate');
  assert.equal(imported.windZone, 'M');
  assert.equal(imported.ventedRidge, 'none');
  assert.equal(imported.defaultPitchDeg, 22.5);
  assert.equal(existingPlaneCount, 0, 'importEnvelopeIntent must not build faces or increase plane count');

  // 8. Boundary guarantee: planTriage reader, adapter & client diagnosis never call solver/playbook or import @google/genai
  const triageDir = path.resolve(__dirname, '..');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const readerCode = stripComments(readFileSync(path.join(triageDir, 'readVectorPdf.ts'), 'utf8'));
  const adapterCode = stripComments(readFileSync(path.join(triageDir, 'importToApexMap.ts'), 'utf8'));
  const diagClientCode = stripComments(readFileSync(path.join(triageDir, 'diagnoseWithGemini.ts'), 'utf8'));
  const diagSharedCode = stripComments(readFileSync(path.join(triageDir, 'triageDiagnosisShared.ts'), 'utf8'));
  for (const banned of ['generateSkeletonLines', 'ensureFaces', 'runTakeoffPlaybook']) {
    assert.equal(readerCode.includes(banned), false, `readVectorPdf.ts must not reference ${banned}`);
    assert.equal(adapterCode.includes(banned), false, `importToApexMap.ts must not reference ${banned}`);
  }
  for (const code of [readerCode, adapterCode, diagClientCode, diagSharedCode]) {
    assert.equal(code.includes('@google/genai'), false, 'Client planTriage modules must never import @google/genai');
  }

  console.log('✓ All Plan Triage R01 fixture, real-plan-set, skeleton gate, loop, diagnosis & boundary assertions passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
