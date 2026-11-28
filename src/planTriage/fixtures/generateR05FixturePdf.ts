import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R05 (Hip + Valley T-Shape).
 */
export async function buildR05FixturePdfBytes(): Promise<Uint8Array> {
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
  const originY = 90;
  const px = (xM: number) => originX + xM * 10;
  const py = (yM: number) => originY + yM * 10;

  // 1. T-Shape Perimeter (16 m wide x 12 m deep, CCW from SW corner [5, 0])
  const ptsM: Array<[number, number]> = [
    [5, 0],
    [11, 0],
    [11, 6],
    [16, 6],
    [16, 12],
    [0, 12],
    [0, 6],
    [5, 6]
  ];
  for (let i = 0; i < ptsM.length; i++) {
    const a = ptsM[i];
    const b = ptsM[(i + 1) % ptsM.length];
    drawLineMm(px(a[0]), py(a[1]), px(b[0]), py(b[1]), 1.8, black);
  }

  // 2. Ridges: Cross wing (3, 9) -> (13, 9) and Main stem (8, 3) -> (8, 9)
  drawLineMm(px(3), py(9), px(13), py(9), 1.4, black, [6, 4]);
  drawTextMm('RIDGE', px(4.5), py(9) + 2, 8.5, true, black);

  drawLineMm(px(8), py(3), px(8), py(9), 1.4, black, [6, 4]);
  drawTextMm('RIDGE', px(8) + 2, py(5.2), 8.5, true, black);

  // 3. Internal Valleys from reflex corners (5, 6) and (11, 6) -> (8, 9)
  drawLineMm(px(5), py(6), px(8), py(9), 1.2, black);
  drawTextMm('VALLEY', px(5.4), py(7.7), 8, true, black);

  drawLineMm(px(11), py(6), px(8), py(9), 1.2, black);
  drawTextMm('VALLEY', px(9.5), py(7.7), 8, true, black);

  // 4. Outer Hips
  drawLineMm(px(5), py(0), px(8), py(3), 1.2, black);
  drawTextMm('HIP', px(5.6), py(1.8), 7.5, true, darkSlate);
  drawLineMm(px(11), py(0), px(8), py(3), 1.2, black);
  drawTextMm('HIP', px(9.4), py(1.8), 7.5, true, darkSlate);

  drawLineMm(px(0), py(6), px(3), py(9), 1.2, black);
  drawTextMm('HIP', px(1.0), py(7.5), 7.5, true, darkSlate);
  drawLineMm(px(0), py(12), px(3), py(9), 1.2, black);
  drawTextMm('HIP', px(1.0), py(10.5), 7.5, true, darkSlate);

  drawLineMm(px(16), py(6), px(13), py(9), 1.2, black);
  drawTextMm('HIP', px(14.3), py(7.5), 7.5, true, darkSlate);
  drawLineMm(px(16), py(12), px(13), py(9), 1.2, black);
  drawTextMm('HIP', px(14.3), py(10.5), 7.5, true, darkSlate);

  // 5. Eave Labels on all 8 perimeter edges
  drawTextMm('EAVE', px(7.5), py(0) - 4.5, 8, true, darkSlate);
  drawTextMm('EAVE', px(11) + 2, py(2.8), 8, true, darkSlate);
  drawTextMm('EAVE', px(13.2), py(6) - 4.5, 8, true, darkSlate);
  drawTextMm('EAVE', px(16) + 2, py(8.8), 8, true, darkSlate);
  drawTextMm('EAVE', px(7.5), py(12) + 2, 8, true, darkSlate);
  drawTextMm('EAVE', px(0) - 11, py(8.8), 8, true, darkSlate);
  drawTextMm('EAVE', px(2.0), py(6) - 4.5, 8, true, darkSlate);
  drawTextMm('EAVE', px(5) - 11, py(2.8), 8, true, darkSlate);

  // 6. Overall Dimensions: 16000 north, 12000 west
  drawLineMm(px(0), py(12) + 12, px(16), py(12) + 12, 0.6, midSlate);
  drawLineMm(px(0), py(12) + 9, px(0), py(12) + 15, 0.6, midSlate);
  drawLineMm(px(16), py(12) + 9, px(16), py(12) + 15, 0.6, midSlate);
  drawTextMm('16000', px(7.3), py(12) + 14.5, 9.5, true, black);

  drawLineMm(px(0) - 20, py(0), px(0) - 20, py(12), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(0), px(0) - 17, py(0), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(12), px(0) - 17, py(12), 0.6, midSlate);
  drawTextMm('12000', px(0) - 33, py(5.8), 9.5, true, black);

  // 7. Fall arrow 22.5°
  drawLineMm(px(6.5), py(11.4), px(6.5), py(9.6), 0.8, darkSlate);
  drawTextMm('22.5°', px(6.8), py(10.3), 8.5, true, black);

  // 8. North Arrow UP
  drawLineMm(225, 226, 225, 248, 1.2, black);
  drawLineMm(225, 248, 222, 242, 1.2, black);
  drawLineMm(225, 248, 228, 242, 1.2, black);
  drawTextMm('N', 223, 251, 11, true, black);

  // 9. General notes & Title Block
  drawTextMm('GENERAL NOTES: Eave height RL: 2.700 m.', 45, 58, 9.5, false, black);

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
    'Project: ApexMap Fixture House R05',
    'Sheet: A-201 T-Shape Roof Plan',
    'Scale: 1:100',
    'Profile: Corrugate 0.55',
    'Wind zone: Very High (VH)',
    'Vented ridge: none',
    'Pitch: 22.5 degrees unless noted',
    'North: up the page'
  ];
  titleLines.forEach((line, idx) => {
    drawTextMm(line, tbX0 + 6, tbY1 - 24 - idx * 9.5, 9, idx < 2, black);
  });

  drawLineMm(10, 10, 410, 10, 0.8, borderGray);
  drawLineMm(410, 10, 410, 287, 0.8, borderGray);
  drawLineMm(410, 287, 10, 287, 0.8, borderGray);
  drawLineMm(10, 287, 10, 10, 0.8, borderGray);

  return pdfDoc.save();
}
