import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;
const mm = (val: number) => val * PT_PER_MM;

/**
 * Generates the deterministic 5-page A3 landscape vector PDF fixture for ApexMap Fixture House R06:
 *   Page 1: Site Plan (role: site) – LOT 14 DP 489210, Wind Zone: VERY HIGH, Scale 1:200
 *   Page 2: Floor Plan (role: floor) – walls + internal partitions, Scale 1:50 / 1:100
 *   Page 3: Roof Plan (role: roof) – 13m x 8m gable roof + ridge, Scale 1:100
 *   Page 4: Elevations (role: elevation) – UNITARY PLAN HIRB 2.5m & 45° + explicit pitch 20°
 *   Page 5: Details (role: details) – FD-01 flashing details
 */
export async function buildR06FixturePdfBytes(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0.08, 0.1, 0.14);
  const darkSlate = rgb(0.22, 0.27, 0.34);
  const midSlate = rgb(0.42, 0.48, 0.56);
  const borderGray = rgb(0.3, 0.36, 0.45);

  const drawText = (
    page: ReturnType<PDFDocument['addPage']>,
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

  const drawLine = (
    page: ReturnType<PDFDocument['addPage']>,
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

  const drawTitleBlock = (
    page: ReturnType<PDFDocument['addPage']>,
    lines: string[]
  ) => {
    const tbX0 = 255;
    const tbY0 = 15;
    const tbX1 = 405;
    const tbY1 = 108;
    drawLine(page, tbX0, tbY0, tbX1, tbY0, 1.2, black);
    drawLine(page, tbX1, tbY0, tbX1, tbY1, 1.2, black);
    drawLine(page, tbX1, tbY1, tbX0, tbY1, 1.2, black);
    drawLine(page, tbX0, tbY1, tbX0, tbY0, 1.2, black);
    drawText(page, 'TEST PLAN — NOT FOR CONSTRUCTION', tbX0 + 6, tbY1 - 10, 9.5, true, black);
    drawLine(page, tbX0, tbY1 - 14, tbX1, tbY1 - 14, 0.7, borderGray);
    lines.forEach((line, idx) => {
      drawText(page, line, tbX0 + 6, tbY1 - 24 - idx * 9.5, 9, idx < 2, black);
    });
    drawLine(page, 10, 10, 410, 10, 0.8, borderGray);
    drawLine(page, 410, 10, 410, 287, 0.8, borderGray);
    drawLine(page, 410, 287, 10, 287, 0.8, borderGray);
    drawLine(page, 10, 287, 10, 10, 0.8, borderGray);
  };

  // --- Page 1: Site Plan ---
  {
    const p1 = pdfDoc.addPage([mm(420), mm(297)]);
    drawText(p1, 'PROPOSED SITE PLAN', 45, 250, 14, true, black);
    drawText(p1, 'LOT 14 DP 489210  Site Area: 680.0 m²', 45, 236, 10, false, black);
    drawText(p1, 'Wind Zone: VERY HIGH', 45, 224, 10, true, black);
    // Site boundary box
    drawLine(p1, 55, 80, 185, 80, 1.2, darkSlate);
    drawLine(p1, 185, 80, 185, 190, 1.2, darkSlate);
    drawLine(p1, 185, 190, 55, 190, 1.2, darkSlate);
    drawLine(p1, 55, 190, 55, 80, 1.2, darkSlate);
    drawTitleBlock(p1, [
      'Project: ApexMap Fixture House R06',
      'Sheet: C-101 Site Plan',
      'Scale: 1:200',
      'North: up the page'
    ]);
  }

  // --- Page 2: Floor Plan ---
  {
    const p2 = pdfDoc.addPage([mm(420), mm(297)]);
    const ox = 48;
    const oy = 95;
    // 13 m x 8 m @ 1:100 => 130 mm x 80 mm + internal partition walls
    drawLine(p2, ox, oy, ox + 130, oy, 1.6, black);
    drawLine(p2, ox + 130, oy, ox + 130, oy + 80, 1.6, black);
    drawLine(p2, ox + 130, oy + 80, ox, oy + 80, 1.6, black);
    drawLine(p2, ox, oy + 80, ox, oy, 1.6, black);
    drawLine(p2, ox, oy + 40, ox + 130, oy + 40, 1.0, darkSlate);
    drawLine(p2, ox + 55, oy, ox + 55, oy + 80, 1.0, darkSlate);
    drawText(p2, '13.000', ox + 60, oy - 12, 9.5, true, black);
    drawText(p2, '8.000', ox - 20, oy + 38, 9.5, true, black);
    drawText(p2, 'Floor Area: 104.0 m²', 45, 55, 9.5, false, black);
    drawTitleBlock(p2, [
      'Project: ApexMap Fixture House R06',
      'Sheet: A-101 Floor Plan',
      '1:50 / 1:100',
      'North: up the page'
    ]);
  }

  // --- Page 3: Roof Plan (canonical geometry source) ---
  {
    const p3 = pdfDoc.addPage([mm(420), mm(297)]);
    const ox = 48;
    const oy = 95;
    const px = (xM: number) => ox + xM * 10;
    const py = (yM: number) => oy + yM * 10;

    drawLine(p3, px(0), py(0), px(13), py(0), 1.8, black);
    drawLine(p3, px(13), py(0), px(13), py(8), 1.8, black);
    drawLine(p3, px(13), py(8), px(0), py(8), 1.8, black);
    drawLine(p3, px(0), py(8), px(0), py(0), 1.8, black);

    // Central Ridge
    drawLine(p3, px(0), py(4), px(13), py(4), 1.3, black, [6, 4]);
    drawText(p3, 'RIDGE', px(5.8), py(4) + 2.5, 9, true, black);

    // Perimeter edges
    drawText(p3, 'EAVE', px(5.8), py(0) - 5, 8.5, true, darkSlate);
    drawText(p3, 'GABLE', px(13) + 3, py(3.8), 8.5, true, darkSlate);
    drawText(p3, 'EAVE', px(5.8), py(8) + 2.5, 8.5, true, darkSlate);
    drawText(p3, 'GABLE', px(0) - 14, py(3.8), 8.5, true, darkSlate);

    // Dimensions
    drawLine(p3, px(0), py(0) - 11, px(13), py(0) - 11, 0.6, midSlate);
    drawLine(p3, px(0), py(0) - 8, px(0), py(0) - 14, 0.6, midSlate);
    drawLine(p3, px(13), py(0) - 8, px(13), py(0) - 14, 0.6, midSlate);
    drawText(p3, '13000', px(5.8), py(0) - 15.5, 9.5, true, black);

    drawLine(p3, px(0) - 20, py(0), px(0) - 20, py(8), 0.6, midSlate);
    drawLine(p3, px(0) - 23, py(0), px(0) - 17, py(0), 0.6, midSlate);
    drawLine(p3, px(0) - 23, py(8), px(0) - 17, py(8), 0.6, midSlate);
    drawText(p3, '8000', px(0) - 31, py(3.8), 9.5, true, black);

    // Fall arrow 20°
    drawLine(p3, px(4), py(3.5), px(4), py(1.3), 0.9, darkSlate);
    drawLine(p3, px(4), py(1.3), px(4) - 2, py(1.3) + 3.5, 0.9, darkSlate);
    drawLine(p3, px(4), py(1.3), px(4) + 2, py(1.3) + 3.5, 0.9, darkSlate);
    drawText(p3, '20°', px(4) + 2.5, py(2.1), 9, true, black);

    drawText(p3, 'Eave height RL: 2.700 m to top of fascia.', 45, 58, 9.5, false, black);
    drawText(p3, 'Net Roof Area: 110.7 m²', 45, 50, 9.5, false, black);

    drawTitleBlock(p3, [
      'Project: ApexMap Fixture House R06',
      'Sheet: A-201 Roof Plan',
      'Scale: 1:100',
      'Profile: Corrugate 0.55',
      'Vented ridge: none',
      'Pitch: 20 degrees',
      'North: up the page'
    ]);
  }

  // --- Page 4: Elevations (HIRB 45° must NOT override explicit 20° roof pitch) ---
  {
    const p4 = pdfDoc.addPage([mm(420), mm(297)]);
    drawText(p4, 'NORTH & SOUTH ELEVATIONS', 45, 250, 14, true, black);
    drawText(p4, 'UNITARY PLAN', 45, 215, 9.5, true, black);
    drawText(p4, 'HIRB 2.5m & 45°', 45, 204, 9.5, false, black);
    drawText(p4, 'Roof pitch: 20°', 45, 190, 9.5, true, black);
    drawTitleBlock(p4, [
      'Project: ApexMap Fixture House R06',
      'Sheet: A-301 Elevations',
      'Scale: 1:100'
    ]);
  }

  // --- Page 5: Details ---
  {
    const p5 = pdfDoc.addPage([mm(420), mm(297)]);
    drawText(p5, 'TYPICAL FLASHING DETAILS', 45, 250, 14, true, black);
    drawText(p5, 'FD-01 RIDGE: Corrugate ridge flashing,', 45, 215, 10, true, black);
    drawText(p5, 'Cover 150 mm, Vented ridge none.', 45, 205, 10, false, black);
    drawTitleBlock(p5, [
      'Project: ApexMap Fixture House R06',
      'Sheet: D-501 Details',
      'Scale: 1:5'
    ]);
  }

  return pdfDoc.save();
}
