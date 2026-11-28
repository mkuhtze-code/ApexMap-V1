import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVectorPdf } from '../readVectorPdf';
import { importEnvelopeIntent } from '../importToApexMap';
import {
  applyDiagnosisMerge,
  buildTriageDiagnosisPayload,
  sanitizeTriageDiagnosis
} from '../diagnoseWithGemini';
import {
  PLAN_TRIAGE_FIXTURE_CATALOG,
  buildR02FixturePdfBytes,
  buildR03FixturePdfBytes,
  buildR04FixturePdfBytes,
  buildR05FixturePdfBytes,
  buildR06FixturePdfBytes,
  buildR07FixturePdfBytes,
  buildR08FixturePdfBytes,
  buildR09FixturePdfBytes,
  buildR10FixturePdfBytes
} from '../fixtures';
import type { EnvelopeIntent, TriagePoint2D } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

interface GoldenIntentJson {
  fixtureId: string;
  scope: string;
  scale: string | null;
  selectedPage?: number;
  recommendedPage?: number;
  pageCount?: number;
  units: string;
  north: 'up' | null;
  profileFamily: string | null;
  windZone: string | null;
  ventedRidge: string | null;
  eaveHeightM: number | null;
  pitchDeg: number | null;
  bodies: Array<{
    id: string;
    outline: Array<[number, number]>;
    holes: Array<Array<[number, number]>>;
    edges: Array<{ type: string; eaveHeightM?: number }>;
    skeleton: Array<{ type: string; from: [number, number]; to: [number, number] }>;
  }>;
  flashingHints: Array<{
    detail: string;
    kind: string;
    coverMm: number | null;
    ventedRidge: string | null;
  }>;
  openings: Array<{ type: string; center: { x: number; y: number } }>;
  blockers: string[];
}

function approxPt(a: TriagePoint2D, b: [number, number], tol = 0.05): boolean {
  return Math.abs(a.x - b[0]) <= tol && Math.abs(a.y - b[1]) <= tol;
}

function skeletonMatches(
  actual: EnvelopeIntent['bodies'][number]['skeleton'][number],
  expected: { type: string; from: [number, number]; to: [number, number] },
  tol = 0.05
): boolean {
  if (actual.type !== expected.type) return false;
  return (
    (approxPt(actual.from, expected.from, tol) && approxPt(actual.to, expected.to, tol)) ||
    (approxPt(actual.from, expected.to, tol) && approxPt(actual.to, expected.from, tol))
  );
}

function assertMatchesGolden(fixtureId: string, actual: EnvelopeIntent, truth: GoldenIntentJson) {
  assert.equal(actual.fixtureId, truth.fixtureId, `${fixtureId}: fixtureId`);
  assert.equal(actual.scope, truth.scope, `${fixtureId}: scope`);
  assert.equal(actual.scale, truth.scale, `${fixtureId}: scale`);
  assert.equal(actual.units, truth.units, `${fixtureId}: units`);
  assert.equal(actual.north, truth.north, `${fixtureId}: north`);
  assert.equal(actual.profileFamily, truth.profileFamily, `${fixtureId}: profileFamily`);
  assert.equal(actual.windZone, truth.windZone, `${fixtureId}: windZone`);
  assert.equal(actual.ventedRidge, truth.ventedRidge, `${fixtureId}: ventedRidge`);
  assert.equal(actual.eaveHeightM ?? null, truth.eaveHeightM, `${fixtureId}: eaveHeightM`);
  assert.equal(actual.pitchDeg ?? null, truth.pitchDeg, `${fixtureId}: pitchDeg`);
  assert.deepEqual(actual.blockers, truth.blockers, `${fixtureId}: blockers`);

  if (truth.selectedPage !== undefined) {
    assert.equal(actual.selectedPage, truth.selectedPage, `${fixtureId}: selectedPage`);
  }
  if (truth.recommendedPage !== undefined) {
    assert.equal(actual.recommendedPage, truth.recommendedPage, `${fixtureId}: recommendedPage`);
  }
  if (truth.pageCount !== undefined) {
    assert.equal(actual.pageCount, truth.pageCount, `${fixtureId}: pageCount`);
  }

  assert.equal(actual.bodies.length, truth.bodies.length, `${fixtureId}: bodies count`);

  truth.bodies.forEach((tBody, bIdx) => {
    const aBody = actual.bodies[bIdx];
    assert.equal(
      aBody.outline.length,
      tBody.outline.length,
      `${fixtureId}: outline vertex count`
    );
    aBody.outline.forEach((pt, idx) => {
      const [tx, ty] = tBody.outline[idx];
      assert.ok(
        approxPt(pt, [tx, ty], 0.05),
        `${fixtureId} outline[${idx}] (${pt.x}, ${pt.y}) expected (${tx}, ${ty}) ±0.05m`
      );
    });

    assert.deepEqual(
      aBody.edges.map((e) => e.type),
      tBody.edges.map((e) => e.type),
      `${fixtureId}: perimeter edge types`
    );
    tBody.edges.forEach((te, eIdx) => {
      if (te.eaveHeightM !== undefined) {
        assert.equal(
          aBody.edges[eIdx].eaveHeightM,
          te.eaveHeightM,
          `${fixtureId}: edge[${eIdx}] eaveHeightM`
        );
      }
    });

    assert.equal(aBody.holes.length, tBody.holes.length, `${fixtureId}: holes count`);
    tBody.holes.forEach((tHole, hIdx) => {
      const aHole = aBody.holes[hIdx];
      assert.equal(aHole.length, tHole.length, `${fixtureId}: hole[${hIdx}] vertices`);
      aHole.forEach((pt, pIdx) => {
        const [hx, hy] = tHole[pIdx];
        assert.ok(
          approxPt(pt, [hx, hy], 0.05),
          `${fixtureId} hole[${hIdx}][${pIdx}] (${pt.x}, ${pt.y}) expected (${hx}, ${hy})`
        );
      });
    });

    assert.equal(
      aBody.skeleton.length,
      tBody.skeleton.length,
      `${fixtureId}: skeleton count (${aBody.skeleton.length} vs ${tBody.skeleton.length})`
    );
    for (const tSkel of tBody.skeleton) {
      assert.ok(
        aBody.skeleton.some((aSkel) => skeletonMatches(aSkel, tSkel, 0.05)),
        `${fixtureId}: missing expected skeleton ${tSkel.type} (${tSkel.from})->(${tSkel.to})`
      );
    }
  });

  assert.deepEqual(actual.flashingHints, truth.flashingHints, `${fixtureId}: flashingHints`);
  assert.equal(actual.openings.length, truth.openings.length, `${fixtureId}: openings count`);
  for (const tOp of truth.openings) {
    assert.ok(
      actual.openings.some(
        (aOp) =>
          aOp.type === tOp.type &&
          Math.abs(aOp.center.x - tOp.center.x) <= 0.05 &&
          Math.abs(aOp.center.y - tOp.center.y) <= 0.05
      ),
      `${fixtureId}: missing opening ${tOp.type} at (${tOp.center.x}, ${tOp.center.y})`
    );
  }
}

async function main() {
  console.log('--- Starting ApexMap Plan Triage Fixture Library Suite (R01-R10) ---');
  assert.equal(PLAN_TRIAGE_FIXTURE_CATALOG.length, 10, 'Catalog must list R01..R10');

  const builders: Record<string, () => Promise<Uint8Array>> = {
    R02: buildR02FixturePdfBytes,
    R03: buildR03FixturePdfBytes,
    R04: buildR04FixturePdfBytes,
    R05: buildR05FixturePdfBytes,
    R06: buildR06FixturePdfBytes,
    R07: buildR07FixturePdfBytes,
    R08: buildR08FixturePdfBytes,
    R09: buildR09FixturePdfBytes,
    R10: buildR10FixturePdfBytes
  };

  for (const entry of PLAN_TRIAGE_FIXTURE_CATALOG) {
    const pdfBytes = readFileSync(path.join(fixturesDir, entry.pdfFile));
    const golden = JSON.parse(
      readFileSync(path.join(fixturesDir, entry.goldenIntentFile), 'utf8')
    ) as GoldenIntentJson;

    const parsed = await readVectorPdf(pdfBytes);
    assertMatchesGolden(entry.id, parsed, golden);

    if (builders[entry.id]) {
      const rebuiltBytes = await builders[entry.id]();
      const reparsed = await readVectorPdf(rebuiltBytes);
      assertMatchesGolden(`${entry.id}-builder`, reparsed, golden);
    }

    if (golden.blockers.length === 0 && golden.bodies.length > 0) {
      const imported = importEnvelopeIntent(parsed);
      assert.equal(
        imported.level.outline.points.length,
        golden.bodies[0].outline.length,
        `${entry.id}: imported outline points`
      );
      assert.equal(
        imported.level.skeleton.length,
        golden.bodies[0].skeleton.length,
        `${entry.id}: imported skeleton count`
      );
    } else {
      assert.throws(() => importEnvelopeIntent(parsed), /blockers/);
    }
    console.log(`✓ ${entry.id} (${entry.name}) golden & import verified`);
  }

  // Targeted behavior checks across priority & special rules:

  // R03: full hip = 1 ridge + 4 hips, zero gables
  const r03 = await readVectorPdf(readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R03.pdf')));
  assert.equal(r03.bodies[0].skeleton.filter((s) => s.type === 'ridge').length, 1);
  assert.equal(r03.bodies[0].skeleton.filter((s) => s.type === 'hip').length, 4);

  // R04: mono-pitch differentiated eave heights + fall arrow does not create ridge
  const r04 = await readVectorPdf(readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R04.pdf')));
  assert.equal(r04.bodies[0].skeleton.length, 0);
  assert.equal(r04.bodies[0].edges[0].eaveHeightM, 2.4);
  assert.equal(r04.bodies[0].edges[2].eaveHeightM, 3.2);

  // R05: T-shape hip + valley counts
  const r05 = await readVectorPdf(readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R05.pdf')));
  assert.equal(r05.bodies[0].skeleton.filter((s) => s.type === 'valley').length, 2);
  assert.equal(r05.bodies[0].skeleton.filter((s) => s.type === 'ridge').length, 2);
  assert.equal(r05.bodies[0].skeleton.filter((s) => s.type === 'hip').length, 6);

  // R06: Multi-page selection, role classification, HIRB ignored in favor of 20° roof pitch, blocked non-plan pages
  const r06Bytes = readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R06.pdf'));
  const r06 = await readVectorPdf(r06Bytes);
  assert.deepEqual(
    r06.pages?.map((p) => p.role),
    ['site', 'floor', 'roof', 'elevation', 'details']
  );
  assert.equal(r06.pitchDeg, 20, 'R06 must preserve explicit 20° pitch and ignore HIRB 45°');
  const r06Site = await readVectorPdf(r06Bytes, { pageNumber: 1 });
  assert.equal(r06Site.bodies.length, 0);
  assert.ok(r06Site.blockers.length > 0);
  const r06Details = await readVectorPdf(r06Bytes, { pageNumber: 5 });
  assert.equal(r06Details.bodies.length, 0);
  assert.ok(r06Details.blockers.length > 0);
  const r06DiagPayload = buildTriageDiagnosisPayload(r06);
  assert.equal(r06DiagPayload.selectedPage, 3);

  // R07: All 3 missing/ambiguous scale variants fail cleanly and resolve once manualScaleDenom=100 is supplied
  for (const mode of ['omit_all', 'conflicting', 'scale_bar_only'] as const) {
    const bytes = await buildR07FixturePdfBytes({ mode });
    const blocked = await readVectorPdf(bytes);
    assert.equal(blocked.bodies.length, 0, `R07 ${mode} must emit 0 bodies`);
    assert.ok(blocked.blockers.length > 0, `R07 ${mode} must emit blocker`);
    if (mode !== 'conflicting') {
      assert.deepEqual(blocked.blockers, ['missing scale']);
    } else {
      assert.ok(blocked.blockers.includes('dimension mismatch'));
    }

    const resolved = await readVectorPdf(bytes, { manualScaleDenom: 100 });
    assert.deepEqual(resolved.blockers, [], `R07 ${mode} manual 1:100 resolves`);
    assert.equal(resolved.scaleSource, 'user');
    assert.equal(resolved.bodies.length, 1);
    assert.equal(resolved.bodies[0].outline[1].x, 12);
    assert.equal(resolved.bodies[0].outline[2].y, 7);
  }

  // R08: Critical floor proxy safety rule (single page + 2-page wind zone variant + diagnosis merge)
  const r08 = await readVectorPdf(readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R08.pdf')));
  assert.equal(r08.bodies[0].skeleton.length, 0, 'R08 floor proxy must never turn interior walls into ridges');
  const r08TwoPage = await readVectorPdf(await buildR08FixturePdfBytes({ includeWindOnSecondPage: true }));
  assert.equal(r08TwoPage.windZone, 'M');
  assert.equal(r08TwoPage.bodies[0].skeleton.length, 0);
  const r08Payload = buildTriageDiagnosisPayload(r08);
  const r08Diag = sanitizeTriageDiagnosis(
    {
      recommendedPage: 1,
      recommendedRole: 'floor',
      pitchDeg: null,
      pitchSource: null,
      windZone: 'M',
      skeletonPolicy: 'from_vectors',
      confidence: 0.75,
      summary: 'Floor proxy outline extracted cleanly with empty skeleton.',
      actions: [],
      warnings: []
    },
    r08Payload
  );
  assert.equal(r08Diag?.skeletonPolicy, 'empty_on_floor_proxy');
  const r08Merged = applyDiagnosisMerge(r08, r08Diag);
  assert.equal(r08Merged.bodies[0].skeleton.length, 0);

  // R09: Imported RoofOutline preserves courtyard hole
  const r09 = await readVectorPdf(readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R09.pdf')));
  const r09Imported = importEnvelopeIntent(r09);
  assert.equal(r09Imported.level.outline.holes?.length, 1);

  // R10: Imported model preserves standing_seam, EH, RV10P, FD-02
  const r10 = await readVectorPdf(readFileSync(path.join(fixturesDir, 'ApexMap_TestPlan_R10.pdf')));
  const r10Imported = importEnvelopeIntent(r10);
  assert.equal(r10Imported.roofProfileFamily, 'standing_seam');
  assert.equal(r10Imported.windZone, 'EH');
  assert.equal(r10Imported.ventedRidge, 'RV10P');
  assert.equal(r10Imported.flashingHints[0].coverMm, 225);

  console.log('✓ All ApexMap Plan Triage R01–R10 fixture library assertions passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
