import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R04 (Mono-Pitch / Skillion).
 */
export async function buildR04FixturePdfBytes(): Promise<Uint8Array> {
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
    color = black
  ) => {
    page.drawLine({
      start: { x: mm(x1Mm), y: mm(y1Mm) },
      end: { x: mm(x2Mm), y: mm(y2Mm) },
      thickness: thicknessPt,
      color
    });
  };

  // Origin in metres -> page mm (1:100 => 1 m = 10 mm)
  const originX = 48;
  const originY = 95;
  const px = (xM: number) => originX + xM * 10;
  const py = (yM: number) => originY + yM * 10;

  // 1. Rectangle 11.000 m x 7.000 m => 110 mm x 70 mm (no ridge)
  drawLineMm(px(0), py(0), px(11), py(0), 1.8, black);
  drawLineMm(px(11), py(0), px(11), py(7), 1.8, black);
  drawLineMm(px(11), py(7), px(0), py(7), 1.8, black);
  drawLineMm(px(0), py(7), px(0), py(0), 1.8, black);

  // 2. Fall Arrow pointing SOUTH, annotated 8°
  const fallX = px(5.5);
  drawLineMm(fallX, py(4.8), fallX, py(2.2), 1.0, darkSlate);
  drawLineMm(fallX, py(2.2), fallX - 2, py(2.2) + 3.5, 1.0, darkSlate);
  drawLineMm(fallX, py(2.2), fallX + 2, py(2.2) + 3.5, 1.0, darkSlate);
  drawTextMm('8°', fallX + 3, py(3.4), 9.5, true, black);

  // 3. Perimeter Edge Labels: LOW EAVE south, HIGH EAVE north, GABLE east & west
  drawTextMm('LOW EAVE', px(4.5), py(0) - 5, 8.5, true, darkSlate);
  drawTextMm('HIGH EAVE', px(4.5), py(7) + 2.5, 8.5, true, darkSlate);
  drawTextMm('GABLE', px(11) + 3, py(3.3), 8.5, true, darkSlate);
  drawTextMm('GABLE', px(0) - 14, py(3.3), 8.5, true, darkSlate);

  // 4. Dimensions: 11000 south, 7000 west
  drawLineMm(px(0), py(0) - 12, px(11), py(0) - 12, 0.6, midSlate);
  drawLineMm(px(0), py(0) - 9, px(0), py(0) - 15, 0.6, midSlate);
  drawLineMm(px(11), py(0) - 9, px(11), py(0) - 15, 0.6, midSlate);
  drawTextMm('11000', px(4.8), py(0) - 16.5, 9.5, true, black);

  drawLineMm(px(0) - 20, py(0), px(0) - 20, py(7), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(0), px(0) - 17, py(0), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(7), px(0) - 17, py(7), 0.6, midSlate);
  drawTextMm('7000', px(0) - 31, py(3.3), 9.5, true, black);

  // 5. North Arrow pointing UP
  const northX = 205;
  const northY = 232;
  drawLineMm(northX, northY - 12, northX, northY + 12, 1.2, black);
  drawLineMm(northX, northY + 12, northX - 3, northY + 6, 1.2, black);
  drawLineMm(northX, northY + 12, northX + 3, northY + 6, 1.2, black);
  drawTextMm('N', northX - 2, northY + 15, 11, true, black);

  // 6. General Roof Notes with differentiated High/Low Eave heights
  drawTextMm('GENERAL NOTES:', 40, 64, 9.5, true, black);
  drawTextMm('High eave height: 3.200 m (north apron/ridge fascia).', 40, 56, 9.5, false, black);
  drawTextMm('Low eave height: 2.400 m (south gutter fascia).', 40, 49, 9.5, false, black);

  // 7. Title Block
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
    'Project: ApexMap Fixture House R04',
    'Sheet: A-201 Mono Pitch Roof Plan',
    'Scale: 1:100',
    'Profile: Trapezoidal 0.55',
    'Wind zone: Medium (M)',
    'Vented ridge: none',
    'Pitch: 8 degrees mono-pitch',
    'North: up the page'
  ];
  titleLines.forEach((line, idx) => {
    drawTextMm(line, tbX0 + 6, tbY1 - 24 - idx * 9.5, 9, idx < 2, black);
  });

  // Outer sheet border
  drawLineMm(10, 10, 410, 10, 0.8, borderGray);
  drawLineMm(410, 10, 410, 287, 0.8, borderGray);
  drawLineMm(410, 287, 10, 287, 0.8, borderGray);
  drawLineMm(10, 287, 10, 10, 0.8, borderGray);

  return pdfDoc.save();
}
