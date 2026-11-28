import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R09
 * (Courtyard Void + Skylight + Penetration Openings).
 */
export async function buildR09FixturePdfBytes(): Promise<Uint8Array> {
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
  const originY = 92;
  const px = (xM: number) => originX + xM * 10;
  const py = (yM: number) => originY + yM * 10;

  // 1. Outer Roof Body: 14.000 m x 10.000 m => 140 mm x 100 mm
  drawLineMm(px(0), py(0), px(14), py(0), 1.8, black);
  drawLineMm(px(14), py(0), px(14), py(10), 1.8, black);
  drawLineMm(px(14), py(10), px(0), py(10), 1.8, black);
  drawLineMm(px(0), py(10), px(0), py(0), 1.8, black);

  // 2. Interior Courtyard Hole: [5, 3] .. [9, 7] (4 m x 4 m = 16 m²)
  drawLineMm(px(5), py(3), px(9), py(3), 1.4, darkSlate);
  drawLineMm(px(9), py(3), px(9), py(7), 1.4, darkSlate);
  drawLineMm(px(9), py(7), px(5), py(7), 1.4, darkSlate);
  drawLineMm(px(5), py(7), px(5), py(3), 1.4, darkSlate);
  drawTextMm('COURTYARD VOID', px(5.4), py(4.9), 8.5, true, darkSlate);

  // 3. Skylight Opening Box: 1.2 m x 0.8 m centered at (2.0, 8.0) -> [1.4, 7.6]..[2.6, 8.4]
  drawLineMm(px(1.4), py(7.6), px(2.6), py(7.6), 1.0, black);
  drawLineMm(px(2.6), py(7.6), px(2.6), py(8.4), 1.0, black);
  drawLineMm(px(2.6), py(8.4), px(1.4), py(8.4), 1.0, black);
  drawLineMm(px(1.4), py(8.4), px(1.4), py(7.6), 1.0, black);
  drawTextMm('SKYLIGHT 1200x800', px(1.0), py(8.8), 7.5, true, black);

  // 4. Penetration Opening Box: 0.6 m x 0.6 m centered at (11.3, 8.0) -> [11.0, 7.7]..[11.6, 8.3]
  drawLineMm(px(11.0), py(7.7), px(11.6), py(7.7), 1.0, black);
  drawLineMm(px(11.6), py(7.7), px(11.6), py(8.3), 1.0, black);
  drawLineMm(px(11.6), py(8.3), px(11.0), py(8.3), 1.0, black);
  drawLineMm(px(11.0), py(8.3), px(11.0), py(7.7), 1.0, black);
  drawTextMm('PENETRATION', px(10.3), py(8.8), 7.5, true, black);

  // 5. Perimeter Edge Labels
  drawTextMm('EAVE', px(6.4), py(0) - 5, 8.5, true, darkSlate);
  drawTextMm('EAVE', px(14) + 3, py(4.8), 8.5, true, darkSlate);
  drawTextMm('EAVE', px(6.4), py(10) + 2.5, 8.5, true, darkSlate);
  drawTextMm('EAVE', px(0) - 13, py(4.8), 8.5, true, darkSlate);

  // 6. Dimensions: 14000 south, 10000 west
  drawLineMm(px(0), py(0) - 12, px(14), py(0) - 12, 0.6, midSlate);
  drawLineMm(px(0), py(0) - 9, px(0), py(0) - 15, 0.6, midSlate);
  drawLineMm(px(14), py(0) - 9, px(14), py(0) - 15, 0.6, midSlate);
  drawTextMm('14000', px(6.3), py(0) - 16.5, 9.5, true, black);

  drawLineMm(px(0) - 20, py(0), px(0) - 20, py(10), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(0), px(0) - 17, py(0), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(10), px(0) - 17, py(10), 0.6, midSlate);
  drawTextMm('10000', px(0) - 34, py(4.8), 9.5, true, black);

  // 7. North Arrow & Notes
  drawLineMm(215, 224, 215, 246, 1.2, black);
  drawLineMm(215, 246, 212, 240, 1.2, black);
  drawLineMm(215, 246, 218, 240, 1.2, black);
  drawTextMm('N', 213, 249, 11, true, black);

  drawTextMm('GENERAL NOTES: Eave height RL: 2.700 m.', 45, 58, 9.5, false, black);
  drawTextMm('Net Roof Area: 124.0 m²', 45, 50, 9.5, false, black);

  // 8. Title Block
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
    'Project: ApexMap Fixture House R09',
    'Sheet: A-201 Roof Plan',
    'Scale: 1:100',
    'Profile: Corrugate 0.55',
    'Wind zone: Medium (M)',
    'Vented ridge: none',
    'Pitch: 15 degrees',
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
