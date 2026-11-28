import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

/**
 * Generates the deterministic A3 landscape vector PDF fixture for ApexMap Fixture House R10:
 * Coastal / Extra High Wind / Standing Seam / Vented Ridge RV10P / 1:200 / top-left title block / rotated North arrow.
 */
export async function buildR10FixturePdfBytes(): Promise<Uint8Array> {
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

  // Scale 1:200 => 1 m = 5 mm. Roof 18 m x 9 m => 90 mm x 45 mm
  const originX = 160;
  const originY = 110;
  const px = (xM: number) => originX + xM * 5;
  const py = (yM: number) => originY + yM * 5;

  // 1. Roof Body 18.000 m x 9.000 m
  drawLineMm(px(0), py(0), px(18), py(0), 1.8, black);
  drawLineMm(px(18), py(0), px(18), py(9), 1.8, black);
  drawLineMm(px(18), py(9), px(0), py(9), 1.8, black);
  drawLineMm(px(0), py(9), px(0), py(0), 1.8, black);

  // 2. Central Ridge (0, 4.5) -> (18, 4.5)
  drawLineMm(px(0), py(4.5), px(18), py(4.5), 1.3, black, [6, 4]);
  drawTextMm('RIDGE', px(7.5), py(4.5) + 2, 8.5, true, black);

  // 3. Perimeter Edges
  drawTextMm('EAVE', px(7.8), py(0) - 5, 8.5, true, darkSlate);
  drawTextMm('GABLE', px(18) + 3, py(4.2), 8.5, true, darkSlate);
  drawTextMm('EAVE', px(7.8), py(9) + 2.5, 8.5, true, darkSlate);
  drawTextMm('GABLE', px(0) - 14, py(4.2), 8.5, true, darkSlate);

  // 4. Overall Dimensions: 18000 south, 9000 west
  drawLineMm(px(0), py(0) - 12, px(18), py(0) - 12, 0.6, midSlate);
  drawLineMm(px(0), py(0) - 9, px(0), py(0) - 15, 0.6, midSlate);
  drawLineMm(px(18), py(0) - 9, px(18), py(0) - 15, 0.6, midSlate);
  drawTextMm('18000', px(7.6), py(0) - 16.5, 9.5, true, black);

  drawLineMm(px(0) - 18, py(0), px(0) - 18, py(9), 0.6, midSlate);
  drawLineMm(px(0) - 21, py(0), px(0) - 15, py(0), 0.6, midSlate);
  drawLineMm(px(0) - 21, py(9), px(0) - 15, py(9), 0.6, midSlate);
  drawTextMm('9000', px(0) - 30, py(4.2), 9.5, true, black);

  // 5. Rotated North Arrow (pointing 45° NE — NOT straight up!)
  drawLineMm(355, 225, 372, 242, 1.3, black);
  drawLineMm(372, 242, 365, 241, 1.3, black);
  drawLineMm(372, 242, 371, 235, 1.3, black);
  drawTextMm('N (45° NE)', 365, 246, 9, true, black);

  // 6. General Notes (coastal eave height 3.0m)
  drawTextMm('GENERAL NOTES:', 150, 62, 9.5, true, black);
  drawTextMm('Eave height RL: 3.000 m marine-grade fascia.', 150, 54, 9.5, false, black);

  // 7. Alternative Title Block Layout — Top-Left Strip (15..140, 180..280)
  const tbX0 = 18;
  const tbY0 = 178;
  const tbX1 = 135;
  const tbY1 = 280;
  drawLineMm(tbX0, tbY0, tbX1, tbY0, 1.3, black);
  drawLineMm(tbX1, tbY0, tbX1, tbY1, 1.3, black);
  drawLineMm(tbX1, tbY1, tbX0, tbY1, 1.3, black);
  drawLineMm(tbX0, tbY1, tbX0, tbY0, 1.3, black);
  drawTextMm('COASTAL SPEC — NOT FOR CONSTRUCTION', tbX0 + 5, tbY1 - 10, 8.5, true, black);
  drawLineMm(tbX0, tbY1 - 14, tbX1, tbY1 - 14, 0.7, borderGray);

  const titleLines = [
    'Project: ApexMap Fixture House R10',
    'Sheet: A-201 Coastal Roof Plan',
    'Scale: 1:200 @ A3',
    'Profile: Standing Seam 0.55',
    'Wind zone: Extra High (EH)',
    'Vented ridge: RV10P',
    'Pitch: 12 degrees'
  ];
  titleLines.forEach((line, idx) => {
    drawTextMm(line, tbX0 + 5, tbY1 - 24 - idx * 10, 8.5, idx < 2, black);
  });

  // 8. Coastal Flashing Detail Box (bottom-left)
  const dbX0 = 18;
  const dbY0 = 20;
  const dbX1 = 135;
  const dbY1 = 80;
  drawLineMm(dbX0, dbY0, dbX1, dbY0, 1.1, borderGray);
  drawLineMm(dbX1, dbY0, dbX1, dbY1, 1.1, borderGray);
  drawLineMm(dbX1, dbY1, dbX0, dbY1, 1.1, borderGray);
  drawLineMm(dbX0, dbY1, dbX0, dbY0, 1.1, borderGray);
  drawTextMm('FLASHING DETAIL', dbX0 + 5, dbY1 - 10, 9, true, darkSlate);
  drawLineMm(dbX0, dbY1 - 14, dbX1, dbY1 - 14, 0.7, borderGray);
  drawTextMm('FD-02 APRON: Standing seam apron,', dbX0 + 5, dbY1 - 24, 8.5, true, black);
  drawTextMm('Cover 225 mm, Vented ridge RV10P.', dbX0 + 5, dbY1 - 34, 8.5, false, black);

  // Sheet border
  drawLineMm(10, 10, 410, 10, 0.8, borderGray);
  drawLineMm(410, 10, 410, 287, 0.8, borderGray);
  drawLineMm(410, 287, 10, 287, 0.8, borderGray);
  drawLineMm(10, 287, 10, 10, 0.8, borderGray);

  return pdfDoc.save();
}
