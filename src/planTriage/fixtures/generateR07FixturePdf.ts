import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

export type R07ScaleFailureMode = 'omit_all' | 'conflicting' | 'scale_bar_only';

export interface R07FixtureBuildOptions {
  mode?: R07ScaleFailureMode;
}

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R07
 * (Missing / Ambiguous Scale). All modes emit blockers and zero bodies until user supplies scale.
 */
export async function buildR07FixturePdfBytes(
  options?: R07FixtureBuildOptions
): Promise<Uint8Array> {
  const mode = options?.mode ?? 'omit_all';
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

  // Drawn at 1:100 (12 m x 7 m => 120 mm x 70 mm)
  const originX = 45;
  const originY = 95;
  const px = (xM: number) => originX + xM * 10;
  const py = (yM: number) => originY + yM * 10;

  drawLineMm(px(0), py(0), px(12), py(0), 1.8, black);
  drawLineMm(px(12), py(0), px(12), py(7), 1.8, black);
  drawLineMm(px(12), py(7), px(0), py(7), 1.8, black);
  drawLineMm(px(0), py(7), px(0), py(0), 1.8, black);

  const yRidge = py(3.5);
  drawLineMm(px(0), yRidge, px(12), yRidge, 1.3, black, [6, 4]);
  drawTextMm('RIDGE', px(5.2), yRidge + 2.5, 9, true, black);

  drawTextMm('EAVE', px(5.3), py(0) - 5, 9, true, darkSlate);
  drawTextMm('EAVE', px(5.3), py(7) + 2.5, 9, true, darkSlate);
  drawTextMm('GABLE', px(0) - 14, yRidge - 1.5, 9, true, darkSlate);
  drawTextMm('GABLE', px(12) + 3, yRidge - 1.5, 9, true, darkSlate);

  // Dimensions: 12000 south, 7000 west
  drawLineMm(px(0), py(0) - 11, px(12), py(0) - 11, 0.6, midSlate);
  drawLineMm(px(0), py(0) - 8, px(0), py(0) - 14, 0.6, midSlate);
  drawLineMm(px(12), py(0) - 8, px(12), py(0) - 14, 0.6, midSlate);
  drawTextMm('12000', px(5.2), py(0) - 15.5, 9.5, true, black);

  drawLineMm(px(0) - 20, py(0), px(0) - 20, py(7), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(0), px(0) - 17, py(0), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(7), px(0) - 17, py(7), 0.6, midSlate);
  drawTextMm('7000', px(0) - 31, yRidge - 1.5, 9.5, true, black);

  // General notes
  drawTextMm('GENERAL NOTES:', 40, 62, 9.5, true, black);
  drawTextMm('Eave height RL: 2.700 m to top of fascia.', 40, 55, 9.5, false, black);

  // Scale bar only rendered in 'conflicting' or 'scale_bar_only' (without ratio text)
  if (mode === 'conflicting' || mode === 'scale_bar_only') {
    const sbX = 40;
    const sbY = 26;
    drawLineMm(sbX, sbY, sbX + 50, sbY, 1.1, black);
    drawLineMm(sbX, sbY + 3, sbX + 50, sbY + 3, 0.7, black);
    for (let m = 0; m <= 5; m++) {
      const tx = sbX + m * 10;
      drawLineMm(tx, sbY, tx, sbY + 3, 0.8, black);
      drawTextMm(m === 5 ? '5 m' : String(m), tx - 1, sbY + 5, 8, false, darkSlate);
    }
    drawTextMm('Graphical scale bar (no ratio printed)', sbX, 17, 8.5, false, darkSlate);
  }

  // Title Block
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
    'Project: ApexMap Fixture House R07',
    'Sheet: A-201 Roof Plan',
    ...(mode === 'conflicting' ? ['Scale: 1:50'] : []),
    'Profile: Corrugate 0.55',
    'Wind zone: Medium (M)',
    'Pitch: 22.5 degrees unless noted',
    'North: up the page'
  ];
  titleLines.forEach((line, idx) => {
    drawTextMm(line, tbX0 + 6, tbY1 - 26 - idx * 10.5, 9.5, idx < 2, black);
  });

  // Outer sheet border
  drawLineMm(10, 10, 410, 10, 0.8, borderGray);
  drawLineMm(410, 10, 410, 287, 0.8, borderGray);
  drawLineMm(410, 287, 10, 287, 0.8, borderGray);
  drawLineMm(10, 287, 10, 10, 0.8, borderGray);

  return pdfDoc.save();
}
