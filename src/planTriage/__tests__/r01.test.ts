import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVectorPdf } from '../readVectorPdf';
import { importEnvelopeIntent } from '../importToApexMap';
import { buildR01FixturePdfBytes } from '../fixtures/generateR01FixturePdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

console.log('--- Starting Plan Triage R01 Fixture Test Suite ---');

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
  assert.equal(intent.units, truth.units);
  assert.equal(intent.north, truth.north);
  assert.equal(intent.profileFamily, truth.profileFamily);
  assert.equal(intent.windZone, truth.windZone);
  assert.equal(intent.ventedRidge, truth.ventedRidge);
  assert.equal(intent.eaveHeightM, truth.eaveHeightM);
  assert.equal(intent.pitchDeg, truth.pitchDeg);

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
  assert.deepEqual(missingScaleIntent.blockers, ['missing scale']);
  assert.equal(missingScaleIntent.bodies.length, 0, 'Missing scale must emit zero bodies');

  // 3. Dimension mismatch copy must refuse to invent a roof body
  const mismatchBytes = await buildR01FixturePdfBytes({ overrideDimLabelSouth: '14500' });
  const mismatchIntent = await readVectorPdf(mismatchBytes);
  assert.ok(mismatchIntent.blockers.includes('dimension mismatch'));
  assert.equal(mismatchIntent.bodies.length, 0);

  // 4. importEnvelopeIntent maps onto ApexMap model without generating faces or calling skeleton solver
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

  // 5. Boundary guarantee: planTriage reader & adapter never call solver/playbook
  const triageDir = path.resolve(__dirname, '..');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const readerCode = stripComments(readFileSync(path.join(triageDir, 'readVectorPdf.ts'), 'utf8'));
  const adapterCode = stripComments(readFileSync(path.join(triageDir, 'importToApexMap.ts'), 'utf8'));
  for (const banned of ['generateSkeletonLines', 'ensureFaces', 'runTakeoffPlaybook']) {
    assert.equal(readerCode.includes(banned), false, `readVectorPdf.ts must not reference ${banned}`);
    assert.equal(adapterCode.includes(banned), false, `importToApexMap.ts must not reference ${banned}`);
  }

  console.log('✓ All Plan Triage R01 fixture, blocker, boundary & import assertions passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
