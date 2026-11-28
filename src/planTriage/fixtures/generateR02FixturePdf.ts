import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

export interface R02FixtureBuildOptions {
  omitScale?: boolean;
}

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R02 (Classic L-Shape).
 */
export async function buildR02FixturePdfBytes(
  options?: R02FixtureBuildOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
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
  const originX = 48;
  const originY = 92;
  const scaleMmPerM = 10;
  const px = (xM: number) => originX + xM * scaleMmPerM;
  const py = (yM: number) => originY + yM * scaleMmPerM;

  // 1. L-Shape Roof Outline (CCW from SW): [0,0], [14,0], [14,6], [8,6], [8,10], [0,10]
  const ptsM: Array<[number, number]> = [
    [0, 0],
    [14, 0],
    [14, 6],
    [8, 6],
    [8, 10],
    [0, 10]
  ];
  for (let i = 0; i < ptsM.length; i++) {
    const a = ptsM[i];
    const b = ptsM[(i + 1) % ptsM.length];
    drawLineMm(px(a[0]), py(a[1]), px(b[0]), py(b[1]), 1.8, black);
  }

  // 2. Main Wing Dashed Ridge: (0, 3.0) to (14, 3.0)
  drawLineMm(px(0), py(3), px(14), py(3), 1.3, black, [6, 4]);
  drawTextMm('RIDGE', px(6.2), py(3) + 2.5, 9, true, black);

  // 3. Perimeter Edge Labels
  drawTextMm('EAVE', px(6.4), py(0) - 5, 8.5, true, darkSlate);
  drawTextMm('GABLE', px(14) + 3, py(2.8), 8.5, true, darkSlate);
  drawTextMm('EAVE', px(10.5), py(6) + 2.5, 8.5, true, darkSlate);
  drawTextMm('EAVE', px(8) + 2.5, py(7.8), 8.5, true, darkSlate);
  drawTextMm('EAVE', px(3.5), py(10) + 2.5, 8.5, true, darkSlate);
  drawTextMm('GABLE', px(0) - 14, py(4.8), 8.5, true, darkSlate);

  // 4. Overall Dimension Chains: 14.000 (south) and 10.000 (west)
  drawLineMm(px(0), py(0) - 12, px(14), py(0) - 12, 0.6, midSlate);
  drawLineMm(px(0), py(0) - 9, px(0), py(0) - 15, 0.6, midSlate);
  drawLineMm(px(14), py(0) - 9, px(14), py(0) - 15, 0.6, midSlate);
  drawTextMm('14.000', px(6.3), py(0) - 16.5, 9.5, true, black);

  drawLineMm(px(0) - 20, py(0), px(0) - 20, py(10), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(0), px(0) - 17, py(0), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(10), px(0) - 17, py(10), 0.6, midSlate);
  drawTextMm('10.000', px(0) - 34, py(4.8), 9.5, true, black);

  // 5. Fall Arrows annotated 22.5° on both pitches of the main wing
  const fallSouthX = px(4);
  drawLineMm(fallSouthX, py(2.6), fallSouthX, py(0.6), 0.9, darkSlate);
  drawLineMm(fallSouthX, py(0.6), fallSouthX - 2, py(0.6) + 3.5, 0.9, darkSlate);
  drawLineMm(fallSouthX, py(0.6), fallSouthX + 2, py(0.6) + 3.5, 0.9, darkSlate);
  drawTextMm('22.5°', fallSouthX + 2.5, py(1.4), 9, true, black);

  const fallNorthX = px(10);
  drawLineMm(fallNorthX, py(3.4), fallNorthX, py(5.4), 0.9, darkSlate);
  drawLineMm(fallNorthX, py(5.4), fallNorthX - 2, py(5.4) - 3.5, 0.9, darkSlate);
  drawLineMm(fallNorthX, py(5.4), fallNorthX + 2, py(5.4) - 3.5, 0.9, darkSlate);
  drawTextMm('22.5°', fallNorthX + 2.5, py(4.2), 9, true, black);

  // 6. North Arrow pointing UP
  const northX = 215;
  const northY = 235;
  drawLineMm(northX, northY - 12, northX, northY + 12, 1.2, black);
  drawLineMm(northX, northY + 12, northX - 3, northY + 6, 1.2, black);
  drawLineMm(northX, northY + 12, northX + 3, northY + 6, 1.2, black);
  drawTextMm('N', northX - 2, northY + 15, 11, true, black);

  // 7. General Roof Notes
  drawTextMm('GENERAL NOTES:', 40, 62, 9.5, true, black);
  drawTextMm('Eave height RL: 2.700 m to top of fascia (all eaves).', 40, 55, 9.5, false, black);
  drawTextMm('No skylights. No roof penetrations.', 40, 48, 9.5, false, black);

  // 8. Scale Bar (0..5 m @ 1:100 => 50 mm)
  const sbX = 40;
  const sbY = 26;
  drawLineMm(sbX, sbY, sbX + 50, sbY, 1.1, black);
  drawLineMm(sbX, sbY + 3, sbX + 50, sbY + 3, 0.7, black);
  for (let m = 0; m <= 5; m++) {
    const tx = sbX + m * 10;
    drawLineMm(tx, sbY, tx, sbY + 3, 0.8, black);
    drawTextMm(m === 5 ? '5 m' : String(m), tx - 1, sbY + 5, 8, false, darkSlate);
  }
  if (!options?.omitScale) {
    drawTextMm('Scale bar 0 to 5 m — 1:100 is drawn so 1 m = 10 mm on the page.', sbX, 17, 8.5, false, darkSlate);
  }

  // 9. Detail Box FD-01
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
  drawTextMm('Cover 150 mm, Vented ridge none.', dbX0 + 6, dbY1 - 33, 9.5, false, black);

  // 10. Title Block
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
    'Project: ApexMap Fixture House R02',
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
