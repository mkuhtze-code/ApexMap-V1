import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

export interface R08FixtureBuildOptions {
  includeWindOnSecondPage?: boolean;
}

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R08 (Floor-Plan Proxy Only).
 * Interior room partition walls must NEVER be promoted into roof ridges (skeleton must remain []).
 */
export async function buildR08FixturePdfBytes(
  options?: R08FixtureBuildOptions
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
    p: ReturnType<PDFDocument['addPage']>,
    text: string,
    xMm: number,
    yMm: number,
    sizePt = 10,
    bold = false,
    color = black
  ) => {
    p.drawText(text, {
      x: mm(xMm),
      y: mm(yMm),
      size: sizePt,
      font: bold ? fontBold : fontRegular,
      color
    });
  };

  const drawLineMm = (
    p: ReturnType<PDFDocument['addPage']>,
    x1Mm: number,
    y1Mm: number,
    x2Mm: number,
    y2Mm: number,
    thicknessPt = 1.0,
    color = black
  ) => {
    p.drawLine({
      start: { x: mm(x1Mm), y: mm(y1Mm) },
      end: { x: mm(x2Mm), y: mm(y2Mm) },
      thickness: thicknessPt,
      color
    });
  };

  // Origin in metres -> page mm (1:100 => 1 m = 10 mm)
  const originX = 48;
  const originY = 100;
  const px = (xM: number) => originX + xM * 10;
  const py = (yM: number) => originY + yM * 10;

  // 1. External Walls: 12.500 m x 6.500 m => 125 mm x 65 mm
  drawLineMm(page, px(0), py(0), px(12.5), py(0), 2.0, black);
  drawLineMm(page, px(12.5), py(0), px(12.5), py(6.5), 2.0, black);
  drawLineMm(page, px(12.5), py(6.5), px(0), py(6.5), 2.0, black);
  drawLineMm(page, px(0), py(6.5), px(0), py(0), 2.0, black);

  // 2. Multiple Long Internal Room Partition Walls (spanning >60% of axes — MUST NOT become ridges)
  drawLineMm(page, px(0), py(3.2), px(12.5), py(3.2), 1.2, darkSlate);
  drawLineMm(page, px(4.2), py(0), px(4.2), py(6.5), 1.2, darkSlate);
  drawLineMm(page, px(8.4), py(3.2), px(8.4), py(6.5), 1.2, darkSlate);

  // Room labels
  drawTextMm(page, 'LIVING / DINING', px(6.5), py(1.3), 8.5, false, darkSlate);
  drawTextMm(page, 'BEDROOM 1', px(1.1), py(4.8), 8.5, false, darkSlate);
  drawTextMm(page, 'BEDROOM 2', px(5.2), py(4.8), 8.5, false, darkSlate);
  drawTextMm(page, 'GARAGE', px(1.2), py(1.3), 8.5, false, darkSlate);

  // 3. Dimension Chains: Overall 12500 & 6500 + Inner Room Chain
  drawLineMm(page, px(0), py(0) - 14, px(12.5), py(0) - 14, 0.6, midSlate);
  drawLineMm(page, px(0), py(0) - 11, px(0), py(0) - 17, 0.6, midSlate);
  drawLineMm(page, px(12.5), py(0) - 11, px(12.5), py(0) - 17, 0.6, midSlate);
  drawTextMm(page, '12500', px(5.6), py(0) - 18.5, 9.5, true, black);

  drawLineMm(page, px(0), py(0) - 7, px(12.5), py(0) - 7, 0.5, midSlate);
  drawTextMm(page, '4200', px(1.5), py(0) - 10, 8, false, darkSlate);
  drawTextMm(page, '8300', px(7.6), py(0) - 10, 8, false, darkSlate);

  drawLineMm(page, px(0) - 16, py(0), px(0) - 16, py(6.5), 0.6, midSlate);
  drawLineMm(page, px(0) - 19, py(0), px(0) - 13, py(0), 0.6, midSlate);
  drawLineMm(page, px(0) - 19, py(6.5), px(0) - 13, py(6.5), 0.6, midSlate);
  drawTextMm(page, '6500', px(0) - 27, py(3.0), 9.5, true, black);

  // 4. North Arrow pointing UP
  const northX = 205;
  const northY = 232;
  drawLineMm(page, northX, northY - 12, northX, northY + 12, 1.2, black);
  drawLineMm(page, northX, northY + 12, northX - 3, northY + 6, 1.2, black);
  drawLineMm(page, northX, northY + 12, northX + 3, northY + 6, 1.2, black);
  drawTextMm(page, 'N', northX - 2, northY + 15, 11, true, black);

  // 5. Floor Area & Notes
  drawTextMm(page, 'Floor Area: 81.25 m²', 48, 56, 9.5, false, black);
  drawTextMm(page, 'FFL: 10.200 m', 48, 48, 9.5, false, black);

  // 6. Title Block
  const tbX0 = 250;
  const tbY0 = 15;
  const tbX1 = 405;
  const tbY1 = 112;
  drawLineMm(page, tbX0, tbY0, tbX1, tbY0, 1.3, black);
  drawLineMm(page, tbX1, tbY0, tbX1, tbY1, 1.3, black);
  drawLineMm(page, tbX1, tbY1, tbX0, tbY1, 1.3, black);
  drawLineMm(page, tbX0, tbY1, tbX0, tbY0, 1.3, black);

  drawTextMm(page, 'TEST PLAN — NOT FOR CONSTRUCTION', tbX0 + 6, tbY1 - 10, 10.5, true, black);
  drawLineMm(page, tbX0, tbY1 - 15, tbX1, tbY1 - 15, 0.8, borderGray);

  const titleLines = [
    'Project: ApexMap Fixture House R08',
    'PROPOSED FLOOR PLAN',
    'Sheet: A-101 Floor Plan',
    'Scale: 1:100',
    ...(options?.includeWindOnSecondPage ? [] : ['Wind zone: Medium (M)']),
    'North: up the page'
  ];
  titleLines.forEach((line, idx) => {
    drawTextMm(page, line, tbX0 + 6, tbY1 - 26 - idx * 10.5, 9.5, idx < 2, black);
  });

  if (options?.includeWindOnSecondPage) {
    const p2 = pdfDoc.addPage([mm(420), mm(297)]);
    drawTextMm(p2, 'SPECIFICATION NOTES', 40, 250, 12, true, black);
    drawTextMm(p2, 'Wind zone: Medium (M)', 40, 235, 10, false, black);
  }

  // Outer sheet border frame
  drawLineMm(page, 10, 10, 410, 10, 0.8, borderGray);
  drawLineMm(page, 410, 10, 410, 287, 0.8, borderGray);
  drawLineMm(page, 410, 287, 10, 287, 0.8, borderGray);
  drawLineMm(page, 10, 287, 10, 10, 0.8, borderGray);

  return pdfDoc.save();
}
