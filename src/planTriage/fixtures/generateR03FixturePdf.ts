import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R03 (Full Hip Roof).
 */
export async function buildR03FixturePdfBytes(): Promise<Uint8Array> {
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
  const originY = 95;
  const scaleMmPerM = 10;
  const px = (xM: number) => originX + xM * scaleMmPerM;
  const py = (yM: number) => originY + yM * scaleMmPerM;

  // 1. Rectangle 12.000 m x 8.000 m
  drawLineMm(px(0), py(0), px(12), py(0), 1.8, black);
  drawLineMm(px(12), py(0), px(12), py(8), 1.8, black);
  drawLineMm(px(12), py(8), px(0), py(8), 1.8, black);
  drawLineMm(px(0), py(8), px(0), py(0), 1.8, black);

  // 2. Central Ridge (3, 4) -> (9, 4) and Four Corner Hips
  drawLineMm(px(3), py(4), px(9), py(4), 1.4, black, [6, 4]);
  drawTextMm('RIDGE', px(5.2), py(4) + 2.5, 9, true, black);

  drawLineMm(px(0), py(0), px(3), py(4), 1.2, black);
  drawTextMm('HIP', px(1.0), py(2.3), 8, true, darkSlate);

  drawLineMm(px(12), py(0), px(9), py(4), 1.2, black);
  drawTextMm('HIP', px(10.2), py(2.3), 8, true, darkSlate);

  drawLineMm(px(12), py(8), px(9), py(4), 1.2, black);
  drawTextMm('HIP', px(10.2), py(5.5), 8, true, darkSlate);

  drawLineMm(px(0), py(8), px(3), py(4), 1.2, black);
  drawTextMm('HIP', px(1.0), py(5.5), 8, true, darkSlate);

  // 3. All 4 Perimeter Edges = EAVE
  drawTextMm('EAVE', px(5.4), py(0) - 5, 8.5, true, darkSlate);
  drawTextMm('EAVE', px(12) + 3, py(3.8), 8.5, true, darkSlate);
  drawTextMm('EAVE', px(5.4), py(8) + 2.5, 8.5, true, darkSlate);
  drawTextMm('EAVE', px(0) - 13, py(3.8), 8.5, true, darkSlate);

  // 4. Dimensions: 12000 south, 8000 west
  drawLineMm(px(0), py(0) - 12, px(12), py(0) - 12, 0.6, midSlate);
  drawLineMm(px(0), py(0) - 9, px(0), py(0) - 15, 0.6, midSlate);
  drawLineMm(px(12), py(0) - 9, px(12), py(0) - 15, 0.6, midSlate);
  drawTextMm('12000', px(5.3), py(0) - 16.5, 9.5, true, black);

  drawLineMm(px(0) - 20, py(0), px(0) - 20, py(8), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(0), px(0) - 17, py(0), 0.6, midSlate);
  drawLineMm(px(0) - 23, py(8), px(0) - 17, py(8), 0.6, midSlate);
  drawTextMm('8000', px(0) - 31, py(3.8), 9.5, true, black);

  // 5. Fall arrow annotated 25°
  const fallX = px(6);
  drawLineMm(fallX, py(3.5), fallX, py(1.3), 0.9, darkSlate);
  drawLineMm(fallX, py(1.3), fallX - 2, py(1.3) + 3.5, 0.9, darkSlate);
  drawLineMm(fallX, py(1.3), fallX + 2, py(1.3) + 3.5, 0.9, darkSlate);
  drawTextMm('25°', fallX + 2.5, py(2.1), 9, true, black);

  // 6. North Arrow pointing UP
  const northX = 205;
  const northY = 232;
  drawLineMm(northX, northY - 12, northX, northY + 12, 1.2, black);
  drawLineMm(northX, northY + 12, northX - 3, northY + 6, 1.2, black);
  drawLineMm(northX, northY + 12, northX + 3, northY + 6, 1.2, black);
  drawTextMm('N', northX - 2, northY + 15, 11, true, black);

  // 7. General Notes
  drawTextMm('GENERAL NOTES:', 40, 60, 9.5, true, black);
  drawTextMm('Eave height RL: 2.700 m to top of fascia (all eaves).', 40, 53, 9.5, false, black);
  drawTextMm('No skylights. No roof penetrations.', 40, 46, 9.5, false, black);

  // 8. Scale Bar
  const sbX = 40;
  const sbY = 26;
  drawLineMm(sbX, sbY, sbX + 50, sbY, 1.1, black);
  drawLineMm(sbX, sbY + 3, sbX + 50, sbY + 3, 0.7, black);
  for (let m = 0; m <= 5; m++) {
    const tx = sbX + m * 10;
    drawLineMm(tx, sbY, tx, sbY + 3, 0.8, black);
    drawTextMm(m === 5 ? '5 m' : String(m), tx - 1, sbY + 5, 8, false, darkSlate);
  }
  drawTextMm('Scale bar 0 to 5 m — 1:100 is drawn so 1 m = 10 mm on the page.', sbX, 17, 8.5, false, darkSlate);

  // 9. Title Block
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
    'Project: ApexMap Fixture House R03',
    'Sheet: A-201 Hip Roof Plan',
    'Scale: 1:100',
    'Profile: Corrugate 0.55',
    'Wind zone: High (H)',
    'Vented ridge: none',
    'Pitch: 25 degrees unless noted',
    'North: up the page'
  ];
  titleLines.forEach((line, idx) => {
    drawTextMm(line, tbX0 + 6, tbY1 - 24 - idx * 9.5, 9, idx < 2, black);
  });

  // Outer sheet border frame
  drawLineMm(10, 10, 410, 10, 0.8, borderGray);
  drawLineMm(410, 10, 410, 287, 0.8, borderGray);
  drawLineMm(410, 287, 10, 287, 0.8, borderGray);
  drawLineMm(10, 287, 10, 10, 0.8, borderGray);

  return pdfDoc.save();
}
