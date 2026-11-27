import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

export interface R01FixtureBuildOptions {
  omitScale?: boolean;
  overrideDimLabelSouth?: string;
}

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R01.
 * Used both to materialize `ApexMap_TestPlan_R01.pdf` and for missing-scale / mismatch tests.
 */
export async function buildR01FixturePdfBytes(
  options?: R01FixtureBuildOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  // A3 landscape: 420 mm x 297 mm
  const page = pdfDoc.addPage([mm(420), mm(297)]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0.08, 0.1, 0.14);
  const darkSlate = rgb(0.22, 0.27, 0.34);
  const midSlate = rgb(0.42, 0.48, 0.56);
  const borderGray = rgb(0.3, 0.36, 0.45);

  const drawTextMm = (
    text: string,
    xMm: number,
    yMm: number,
    sizePt = 10,
    bold = false,
    color = black
  ) => {
    page.drawText(text, {
      x: mm(xMm),
      y: mm(yMm),
      size: sizePt,
      font: bold ? fontBold : fontRegular,
      color
    });
  };

  const drawLineMm = (
    x1Mm: number,
    y1Mm: number,
    x2Mm: number,
    y2Mm: number,
    thicknessPt = 1.0,
    color = black,
    dashArray?: number[]
  ) => {
    page.drawLine({
      start: { x: mm(x1Mm), y: mm(y1Mm) },
      end: { x: mm(x2Mm), y: mm(y2Mm) },
      thickness: thicknessPt,
      color,
      ...(dashArray ? { dashArray } : {})
    });
  };

  // Origin in metres -> page mm (1:100 => 1 m = 10 mm)
  const originX = 45;
  const originY = 95;
  const scaleMmPerM = 10;
  const px = (xM: number) => originX + xM * scaleMmPerM;
  const py = (yM: number) => originY + yM * scaleMmPerM;

  // 1. Outer Roof Rectangle: 12.000 m x 7.000 m => 120 mm x 70 mm
  const x0 = px(0);
  const y0 = py(0);
  const x1 = px(12);
  const y1 = py(7);
  drawLineMm(x0, y0, x1, y0, 1.8, black);
  drawLineMm(x1, y0, x1, y1, 1.8, black);
  drawLineMm(x1, y1, x0, y1, 1.8, black);
  drawLineMm(x0, y1, x0, y0, 1.8, black);

  // 2. Dashed Ridge from (0, 3.5) to (12, 3.5)
  const yRidge = py(3.5);
  drawLineMm(x0, yRidge, x1, yRidge, 1.3, black, [6, 4]);
  drawTextMm('RIDGE', (x0 + x1) / 2 - 8, yRidge + 2.5, 9, true, black);

  // 3. Perimeter Edge Classifications: South & North = EAVE, West & East = GABLE
  drawTextMm('EAVE', (x0 + x1) / 2 - 7, y0 - 5, 9, true, darkSlate);
  drawTextMm('EAVE', (x0 + x1) / 2 - 7, y1 + 2.5, 9, true, darkSlate);
  drawTextMm('GABLE', x0 - 14, yRidge - 1.5, 9, true, darkSlate);
  drawTextMm('GABLE', x1 + 3, yRidge - 1.5, 9, true, darkSlate);

  // 4. Dimension Strings ("12000" south, "7000" west) + crisp witness ticks
  const southDimLabel = options?.overrideDimLabelSouth ?? '12000';
  drawLineMm(x0, y0 - 11, x1, y0 - 11, 0.6, midSlate);
  drawLineMm(x0, y0 - 8, x0, y0 - 14, 0.6, midSlate);
  drawLineMm(x1, y0 - 8, x1, y0 - 14, 0.6, midSlate);
  drawTextMm(southDimLabel, (x0 + x1) / 2 - 8, y0 - 15.5, 9.5, true, black);

  drawLineMm(x0 - 20, y0, x0 - 20, y1, 0.6, midSlate);
  drawLineMm(x0 - 23, y0, x0 - 17, y0, 0.6, midSlate);
  drawLineMm(x0 - 23, y1, x0 - 17, y1, 0.6, midSlate);
  drawTextMm('7000', x0 - 32, yRidge - 1.5, 9.5, true, black);

  // 5. Two Fall Arrows annotated 22.5°
  // South slope fall arrow (pointing down from ridge toward south eave)
  const fallSouthX = px(3.5);
  drawLineMm(fallSouthX, yRidge - 4, fallSouthX, y0 + 6, 0.9, darkSlate);
  drawLineMm(fallSouthX, y0 + 6, fallSouthX - 2, y0 + 9.5, 0.9, darkSlate);
  drawLineMm(fallSouthX, y0 + 6, fallSouthX + 2, y0 + 9.5, 0.9, darkSlate);
  drawTextMm('22.5°', fallSouthX + 2.5, (yRidge + y0) / 2 - 1.5, 9, true, black);

  // North slope fall arrow (pointing up from ridge toward north eave)
  const fallNorthX = px(8.5);
  drawLineMm(fallNorthX, yRidge + 4, fallNorthX, y1 - 6, 0.9, darkSlate);
  drawLineMm(fallNorthX, y1 - 6, fallNorthX - 2, y1 - 9.5, 0.9, darkSlate);
  drawLineMm(fallNorthX, y1 - 6, fallNorthX + 2, y1 - 9.5, 0.9, darkSlate);
  drawTextMm('22.5°', fallNorthX + 2.5, (yRidge + y1) / 2 - 1.5, 9, true, black);

  // 6. North Arrow pointing UP
  const northX = 205;
  const northY = 232;
  drawLineMm(northX, northY - 12, northX, northY + 12, 1.2, black);
  drawLineMm(northX, northY + 12, northX - 3, northY + 6, 1.2, black);
  drawLineMm(northX, northY + 12, northX + 3, northY + 6, 1.2, black);
  drawTextMm('N', northX - 2, northY + 15, 11, true, black);

  // 7. General Roof Notes
  drawTextMm('GENERAL NOTES:', 40, 62, 9.5, true, black);
  drawTextMm('Eave height RL: 2.700 m to top of fascia (all eaves).', 40, 55, 9.5, false, black);
  drawTextMm('Sheet run: perpendicular to eaves. No skylights. No roof penetrations.', 40, 48, 9.5, false, black);

  // 8. Scale Bar (0 to 5 m at 1:100 => 50 mm total length, inside [35..140, 12..38])
  const sbX = 40;
  const sbY = 26;
  const sbLen = 50; // 5 m @ 1:100
  drawLineMm(sbX, sbY, sbX + sbLen, sbY, 1.1, black);
  drawLineMm(sbX, sbY + 3, sbX + sbLen, sbY + 3, 0.7, black);
  for (let m = 0; m <= 5; m++) {
    const tx = sbX + m * 10;
    drawLineMm(tx, sbY, tx, sbY + 3, 0.8, black);
    drawTextMm(m === 5 ? '5 m' : String(m), tx - 1, sbY + 5, 8, false, darkSlate);
  }
  if (!options?.omitScale) {
    drawTextMm(
      'Scale bar 0 to 5 m — 1:100 is drawn so 1 m = 10 mm on the page.',
      sbX,
      17,
      8.5,
      false,
      darkSlate
    );
  } else {
    drawTextMm('Scale bar 0 to 5 m — Reference grid', sbX, 17, 8.5, false, darkSlate);
  }

  // 9. Detail Box FD-01 RIDGE (right panel upper: x 250..405, y 125..190)
  const dbX0 = 250;
  const dbY0 = 125;
  const dbX1 = 405;
  const dbY1 = 190;
  drawLineMm(dbX0, dbY0, dbX1, dbY0, 1.1, borderGray);
  drawLineMm(dbX1, dbY0, dbX1, dbY1, 1.1, borderGray);
  drawLineMm(dbX1, dbY1, dbX0, dbY1, 1.1, borderGray);
  drawLineMm(dbX0, dbY1, dbX0, dbY0, 1.1, borderGray);
  drawTextMm('FLASHING DETAIL', dbX0 + 6, dbY1 - 10, 9.5, true, darkSlate);
  drawLineMm(dbX0, dbY1 - 14, dbX1, dbY1 - 14, 0.7, borderGray);
  drawTextMm('FD-01 RIDGE: Corrugate ridge flashing,', dbX0 + 6, dbY1 - 24, 9.5, true, black);
  drawTextMm('Cover 150 mm, Vented ridge none, Wind zone M.', dbX0 + 6, dbY1 - 33, 9.5, false, black);

  // 10. Title Block (right panel lower: x 250..405, y 15..112)
  const tbX0 = 250;
  const tbY0 = 15;
  const tbX1 = 405;
  const tbY1 = 112;
  drawLineMm(tbX0, tbY0, tbX1, tbY0, 1.3, black);
  drawLineMm(tbX1, tbY0, tbX1, tbY1, 1.3, black);
  drawLineMm(tbX1, tbY1, tbX0, tbY1, 1.3, black);
  drawLineMm(tbX0, tbY1, tbX0, tbY0, 1.3, black);

  drawTextMm('TEST PLAN — NOT FOR CONSTRUCTION', tbX0 + 6, tbY1 - 10, 10.5, true, black);
  drawLineMm(tbX0, tbY1 - 15, tbX1, tbY1 - 15, 0.8, borderGray);

  const titleLines = [
    'Project: ApexMap Fixture House R01',
    'Sheet: A-201 Roof Plan',
    ...(options?.omitScale ? [] : ['Scale: 1:100']),
    'Profile: Corrugate 0.55',
    'Wind zone: Medium (M)',
    'Pitch: 22.5 degrees unless noted',
    'North: up the page'
  ];
  titleLines.forEach((line, idx) => {
    drawTextMm(line, tbX0 + 6, tbY1 - 26 - idx * 10.5, 9.5, idx < 2, black);
  });

  // Outer sheet border frame
  drawLineMm(10, 10, 410, 10, 0.8, borderGray);
  drawLineMm(410, 10, 410, 287, 0.8, borderGray);
  drawLineMm(410, 287, 10, 287, 0.8, borderGray);
  drawLineMm(10, 287, 10, 10, 0.8, borderGray);

  return pdfDoc.save();
}
