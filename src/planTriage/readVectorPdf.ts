import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  EnvelopeIntent,
  EnvelopeIntentFlashingHint,
  TriageEdgeType,
  TriagePoint2D,
  TriageVentedRidge,
  TriageWindZone
} from './types';

const MM_PER_PT = 25.4 / 72;

interface TextToken {
  text: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

interface TextLine {
  text: string;
  xMinMm: number;
  xMaxMm: number;
  yMm: number;
  tokens: TextToken[];
}

interface VectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface BoxRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function mulCtm(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function applyCtm(ctm: number[], x: number, y: number): { x: number; y: number } {
  return {
    x: ctm[0] * x + ctm[2] * y + ctm[4],
    y: ctm[1] * x + ctm[3] * y + ctm[5]
  };
}

function roundM(val: number): number {
  const r = Math.round(val * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

function pointInBox(x: number, y: number, box: BoxRegion, pad = 0.5): boolean {
  return (
    x >= box.minX - pad &&
    x <= box.maxX + pad &&
    y >= box.minY - pad &&
    y <= box.maxY + pad
  );
}

function segmentInBox(seg: VectorSegment, box: BoxRegion, pad = 0.5): boolean {
  const mx = (seg.x1 + seg.x2) / 2;
  const my = (seg.y1 + seg.y2) / 2;
  return (
    (pointInBox(seg.x1, seg.y1, box, pad) && pointInBox(seg.x2, seg.y2, box, pad)) ||
    pointInBox(mx, my, box, pad)
  );
}

function segLength(seg: VectorSegment): number {
  return Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
}

function distToSegmentMm(pt: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(pt.x - a.x, pt.y - a.y);
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2));
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
}

function groupTextLines(tokens: TextToken[]): TextLine[] {
  const sorted = [...tokens].sort((a, b) => b.yMm - a.yMm || a.xMm - b.xMm);
  const rows: TextToken[][] = [];
  for (const tok of sorted) {
    const existing = rows.find((row) => Math.abs(row[0].yMm - tok.yMm) <= 2.2);
    if (existing) {
      existing.push(tok);
    } else {
      rows.push([tok]);
    }
  }

  const splitLines: TextLine[] = [];
  for (const row of rows) {
    const ordered = [...row].sort((a, b) => a.xMm - b.xMm);
    const segments: TextToken[][] = [];
    for (const item of ordered) {
      const lastSeg = segments[segments.length - 1];
      if (!lastSeg) {
        segments.push([item]);
      } else {
        const prev = lastSeg[lastSeg.length - 1];
        const prevEnd = prev.xMm + Math.max(prev.widthMm, prev.text.length * 1.4);
        if (item.xMm - prevEnd > 25) {
          segments.push([item]);
        } else {
          lastSeg.push(item);
        }
      }
    }

    for (const seg of segments) {
      let combined = '';
      let prevEndX: number | null = null;
      for (const item of seg) {
        if (prevEndX !== null && item.xMm - prevEndX > 0.8) {
          combined += ' ';
        }
        combined += item.text;
        prevEndX = item.xMm + Math.max(item.widthMm, item.text.length * 1.4);
      }
      splitLines.push({
        text: combined.replace(/\s+/g, ' ').trim(),
        xMinMm: Math.min(...seg.map((t) => t.xMm)),
        xMaxMm: Math.max(...seg.map((t) => t.xMm + Math.max(t.widthMm, t.text.length * 1.4))),
        yMm: seg.reduce((s, t) => s + t.yMm, 0) / seg.length,
        tokens: seg
      });
    }
  }
  return splitLines;
}

function extractVectorSegments(ops: { fnArray: number[]; argsArray: any[] }): VectorSegment[] {
  const OPS = pdfjsLib.OPS;
  const segments: VectorSegment[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];

  const strokeOps = new Set<number>([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke
  ]);

  let pending: VectorSegment[] = [];
  let curPt = { x: 0, y: 0 };
  let startPt = { x: 0, y: 0 };

  const pushSegPt = (p1: { x: number; y: number }, p2: { x: number; y: number }, target: VectorSegment[]) => {
    const s: VectorSegment = {
      x1: p1.x * MM_PER_PT,
      y1: p1.y * MM_PER_PT,
      x2: p2.x * MM_PER_PT,
      y2: p2.y * MM_PER_PT
    };
    if (segLength(s) >= 0.25) {
      target.push(s);
    }
  };

  const DRAW_OPS = {
    moveTo: 0,
    lineTo: 1,
    curveTo: 2,
    quadraticCurveTo: 3,
    closePath: 4
  } as const;

  const parseSubOps = (rawOps: ArrayLike<number>, activeCtm: number[], outSegs: VectorSegment[]) => {
    let i = 0;
    let cPt = { x: 0, y: 0 };
    let sPt = { x: 0, y: 0 };
    while (i < rawOps.length) {
      const subOp = rawOps[i++];
      if (subOp === DRAW_OPS.moveTo || subOp === OPS.moveTo) {
        const p = applyCtm(activeCtm, rawOps[i++], rawOps[i++]);
        cPt = p;
        sPt = p;
      } else if (subOp === DRAW_OPS.lineTo || subOp === OPS.lineTo) {
        const p = applyCtm(activeCtm, rawOps[i++], rawOps[i++]);
        pushSegPt(cPt, p, outSegs);
        cPt = p;
      } else if (subOp === DRAW_OPS.curveTo || subOp === OPS.curveTo) {
        i += 4;
        const p = applyCtm(activeCtm, rawOps[i++], rawOps[i++]);
        cPt = p;
      } else if (subOp === DRAW_OPS.quadraticCurveTo) {
        i += 2;
        const p = applyCtm(activeCtm, rawOps[i++], rawOps[i++]);
        cPt = p;
      } else if (subOp === DRAW_OPS.closePath || subOp === OPS.closePath) {
        pushSegPt(cPt, sPt, outSegs);
        cPt = sPt;
      } else if (subOp === OPS.rectangle) {
        const rx = rawOps[i++];
        const ry = rawOps[i++];
        const rw = rawOps[i++];
        const rh = rawOps[i++];
        const p0 = applyCtm(activeCtm, rx, ry);
        const p1 = applyCtm(activeCtm, rx + rw, ry);
        const p2 = applyCtm(activeCtm, rx + rw, ry + rh);
        const p3 = applyCtm(activeCtm, rx, ry + rh);
        pushSegPt(p0, p1, outSegs);
        pushSegPt(p1, p2, outSegs);
        pushSegPt(p2, p3, outSegs);
        pushSegPt(p3, p0, outSegs);
        cPt = p0;
        sPt = p0;
      }
    }
  };

  for (let idx = 0; idx < ops.fnArray.length; idx++) {
    const fn = ops.fnArray[idx];
    const args = ops.argsArray[idx];

    if (fn === OPS.save) {
      stack.push([...ctm]);
    } else if (fn === OPS.restore) {
      const prev = stack.pop();
      if (prev) ctm = prev;
    } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      ctm = mulCtm(ctm, args as number[]);
    } else if (fn === OPS.constructPath && Array.isArray(args)) {
      const paintOp = args[0] as number;
      if (strokeOps.has(paintOp)) {
        const dataArr = args[1] || [];
        const constructed: VectorSegment[] = [];
        for (const chunk of dataArr) {
          if (chunk && typeof chunk.length === 'number') {
            parseSubOps(chunk, ctm, constructed);
          }
        }
        segments.push(...constructed);
      }
    } else if (fn === OPS.moveTo && Array.isArray(args)) {
      const p = applyCtm(ctm, args[0], args[1]);
      curPt = p;
      startPt = p;
    } else if (fn === OPS.lineTo && Array.isArray(args)) {
      const p = applyCtm(ctm, args[0], args[1]);
      pushSegPt(curPt, p, pending);
      curPt = p;
    } else if (fn === OPS.closePath) {
      pushSegPt(curPt, startPt, pending);
      curPt = startPt;
    } else if (fn === OPS.rectangle && Array.isArray(args)) {
      const [rx, ry, rw, rh] = args;
      const p0 = applyCtm(ctm, rx, ry);
      const p1 = applyCtm(ctm, rx + rw, ry);
      const p2 = applyCtm(ctm, rx + rw, ry + rh);
      const p3 = applyCtm(ctm, rx, ry + rh);
      pushSegPt(p0, p1, pending);
      pushSegPt(p1, p2, pending);
      pushSegPt(p2, p3, pending);
      pushSegPt(p3, p0, pending);
    } else if (strokeOps.has(fn)) {
      segments.push(...pending);
      pending = [];
    } else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath) {
      pending = [];
    }
  }

  return segments;
}

interface AxisSpan {
  coord: number; // y for horizontal, x for vertical
  min: number;
  max: number;
}

function mergeAxisSpans(raw: AxisSpan[], coordTol = 0.45, gapTol = 0.5): AxisSpan[] {
  const sorted = [...raw].sort((a, b) => a.coord - b.coord || a.min - b.min);
  const groups: AxisSpan[][] = [];
  for (const s of sorted) {
    const g = groups.find((grp) => Math.abs(grp[0].coord - s.coord) <= coordTol);
    if (g) g.push(s);
    else groups.push([s]);
  }
  const merged: AxisSpan[] = [];
  for (const grp of groups) {
    const avgCoord = grp.reduce((sum, s) => sum + s.coord, 0) / grp.length;
    const byMin = [...grp].sort((a, b) => a.min - b.min);
    let cur = { coord: avgCoord, min: byMin[0].min, max: byMin[0].max };
    for (let i = 1; i < byMin.length; i++) {
      if (byMin[i].min <= cur.max + gapTol) {
        cur.max = Math.max(cur.max, byMin[i].max);
      } else {
        merged.push(cur);
        cur = { coord: avgCoord, min: byMin[i].min, max: byMin[i].max };
      }
    }
    merged.push(cur);
  }
  return merged;
}

function findClosedRectangles(segments: VectorSegment[], tol = 0.5): BoxRegion[] {
  const horizRaw: AxisSpan[] = [];
  const vertRaw: AxisSpan[] = [];

  for (const s of segments) {
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    if (dy <= tol && dx >= 5) {
      horizRaw.push({
        coord: (s.y1 + s.y2) / 2,
        min: Math.min(s.x1, s.x2),
        max: Math.max(s.x1, s.x2)
      });
    } else if (dx <= tol && dy >= 5) {
      vertRaw.push({
        coord: (s.x1 + s.x2) / 2,
        min: Math.min(s.y1, s.y2),
        max: Math.max(s.y1, s.y2)
      });
    }
  }

  const horiz = mergeAxisSpans(horizRaw, tol, tol);
  const vert = mergeAxisSpans(vertRaw, tol, tol);
  const boxes: BoxRegion[] = [];

  for (let i = 0; i < horiz.length; i++) {
    for (let j = i + 1; j < horiz.length; j++) {
      const hBot = horiz[i];
      const hTop = horiz[j];
      if (hTop.coord - hBot.coord < 5) continue;

      const xMin = Math.max(hBot.min, hTop.min);
      const xMax = Math.min(hBot.max, hTop.max);
      if (xMax - xMin < 5) continue;

      const leftCandidates = vert.filter(
        (v) =>
          v.coord >= xMin - tol &&
          v.coord <= xMax - 5 &&
          v.min <= hBot.coord + tol &&
          v.max >= hTop.coord - tol
      );
      const rightCandidates = vert.filter(
        (v) =>
          v.coord >= xMin + 5 &&
          v.coord <= xMax + tol &&
          v.min <= hBot.coord + tol &&
          v.max >= hTop.coord - tol
      );

      for (const vl of leftCandidates) {
        for (const vr of rightCandidates) {
          if (vr.coord - vl.coord < 5) continue;
          if (
            hBot.min <= vl.coord + tol &&
            hBot.max >= vr.coord - tol &&
            hTop.min <= vl.coord + tol &&
            hTop.max >= vr.coord - tol
          ) {
            boxes.push({
              minX: vl.coord,
              minY: hBot.coord,
              maxX: vr.coord,
              maxY: hTop.coord
            });
          }
        }
      }
    }
  }

  return boxes;
}

function findEnclosingBoxForText(
  allRects: BoxRegion[],
  lines: TextLine[],
  matcher: (line: TextLine) => boolean
): BoxRegion | null {
  const matched = lines.filter(matcher);
  if (matched.length === 0) return null;

  const tMinX = Math.min(...matched.map((l) => l.xMinMm));
  const tMaxX = Math.max(...matched.map((l) => l.xMaxMm));
  const tMinY = Math.min(...matched.map((l) => l.yMm));
  const tMaxY = Math.max(...matched.map((l) => l.yMm));

  const enclosing = allRects
    .filter(
      (r) =>
        r.minX <= tMinX + 2 &&
        r.maxX >= tMaxX - 2 &&
        r.minY <= tMinY + 2 &&
        r.maxY >= tMaxY - 2 &&
        (r.maxX - r.minX) * (r.maxY - r.minY) < 40000
    )
    .sort((a, b) => (a.maxX - a.minX) * (a.maxY - a.minY) - (b.maxX - b.minX) * (b.maxY - b.minY));

  if (enclosing.length > 0) return enclosing[0];

  return {
    minX: tMinX - 8,
    minY: tMinY - 8,
    maxX: tMaxX + 8,
    maxY: tMaxY + 8
  };
}

export interface ReadVectorPdfOptions {
  workerSrc?: string;
  fixtureId?: string;
}

/**
 * Pure vector PDF triage reader (page 1 text items + vector line segments).
 * Never renders to pixels, never calls a vision model, never calls ApexMap geometry builders.
 */
export async function readVectorPdf(
  pdfInput: Uint8Array | ArrayBuffer,
  options?: ReadVectorPdfOptions
): Promise<EnvelopeIntent> {
  if (options?.workerSrc && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = options.workerSrc;
  }

  const rawBytes = pdfInput instanceof Uint8Array ? pdfInput : new Uint8Array(pdfInput);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(rawBytes),
    verbosity: 0,
    useWorkerFetch: false
  });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const pageWidthMm = viewport.width * MM_PER_PT;
  const pageHeightMm = viewport.height * MM_PER_PT;

  const textContent = await page.getTextContent();
  const tokens: TextToken[] = [];
  for (const item of textContent.items) {
    if (!('str' in item)) continue;
    const raw = item.str;
    if (!raw || !raw.trim()) continue;
    const t = item.transform;
    tokens.push({
      text: raw.trim(),
      xMm: t[4] * MM_PER_PT,
      yMm: t[5] * MM_PER_PT,
      widthMm: (item.width || 0) * MM_PER_PT,
      heightMm: Math.hypot(t[2], t[3]) * MM_PER_PT || (item.height || 0) * MM_PER_PT
    });
  }

  const lines = groupTextLines(tokens);
  const fullText = lines.map((l) => l.text).join('\n');
  const evidence = lines.map((l) => ({ page: 1, text: l.text }));

  const opList = await page.getOperatorList();
  const allSegments = extractVectorSegments(opList);
  const allRects = findClosedRectangles(allSegments);

  // Extract metadata strictly from printed text
  const fixtureMatch = fullText.match(/Project:\s*ApexMap Fixture House\s+(R\d+)/i);
  const fixtureId = options?.fixtureId ?? (fixtureMatch ? fixtureMatch[1].toUpperCase() : undefined);

  const scaleMatch =
    fullText.match(/\bScale\s*[:=]\s*1\s*:\s*(\d+)\b/i) ??
    fullText.match(/\b1\s*:\s*(\d+)\b(?=[^\n]*(?:is drawn|mm on the page|scale))/i);
  const scaleDenom = scaleMatch ? Number(scaleMatch[1]) : null;
  const scale = scaleDenom && scaleDenom > 0 ? `1:${scaleDenom}` : null;

  const northMatch = fullText.match(/\bNorth\s*[:=]?\s*up\b/i);
  const north: 'up' | null = northMatch ? 'up' : null;

  let profileFamily: string | null = null;
  if (/\bCorrugate\b/i.test(fullText)) profileFamily = 'corrugate';
  else if (/\bTrapezoid(?:al)?\b/i.test(fullText)) profileFamily = 'trapezoidal';
  else if (/\bStanding\s*Seam\b/i.test(fullText)) profileFamily = 'standing_seam';

  let windZone: TriageWindZone | null = null;
  const windMatch = fullText.match(
    /Wind\s*zone\s*[:=]?\s*(?:Extra\s*High|Very\s*High|High|Medium|Low)?\s*\(?(EH|VH|H|M|L)\)?/i
  );
  if (windMatch) {
    windZone = windMatch[1].toUpperCase() as TriageWindZone;
  }

  let pitchDeg: number | null = null;
  const fallPitchMatch = fullText.match(/(\d+(?:\.\d+)?)\s*°/);
  const notePitchMatch = fullText.match(/\bPitch\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:degrees?|deg|°)/i);
  if (fallPitchMatch) {
    pitchDeg = Number(fallPitchMatch[1]);
  } else if (notePitchMatch) {
    pitchDeg = Number(notePitchMatch[1]);
  }

  let eaveHeightM: number | null = null;
  const eaveMatch =
    fullText.match(/Eave\s*height[^0-9\n]*(\d+(?:\.\d+)?)\s*m\b/i) ??
    fullText.match(/(\d+(?:\.\d+)?)\s*m\b[^\n]*(?:top of fascia|all eaves)/i);
  if (eaveMatch) {
    eaveHeightM = Number(eaveMatch[1]);
  }

  let ventedRidge: TriageVentedRidge | null = null;
  const ventedMatch = fullText.match(/Vented\s*ridge\s*[:=]?\s*(none|RV10P)\b/i);
  if (ventedMatch) {
    ventedRidge = (ventedMatch[1].toUpperCase() === 'RV10P' ? 'RV10P' : 'none') as TriageVentedRidge;
  }

  const flashingHints: EnvelopeIntentFlashingHint[] = [];
  for (let i = 0; i < lines.length; i++) {
    const fdMatch = lines[i].text.match(/\b(FD-\d+)\s+([A-Z]+)\s*[:\-]\s*(.+)/i);
    if (!fdMatch) continue;
    const chunkText = [lines[i].text, lines[i + 1]?.text ?? ''].join(' ');
    const coverMatch = chunkText.match(/Cover\s+(\d+(?:\.\d+)?)\s*mm/i);
    const fdVentedMatch = chunkText.match(/Vented\s*ridge\s*[:=]?\s*(none|RV10P)\b/i);
    flashingHints.push({
      detail: fdMatch[1].toUpperCase(),
      kind: fdMatch[2].toLowerCase(),
      coverMm: coverMatch ? Number(coverMatch[1]) : null,
      ventedRidge: fdVentedMatch
        ? ((fdVentedMatch[1].toUpperCase() === 'RV10P' ? 'RV10P' : 'none') as TriageVentedRidge)
        : ventedRidge
    });
  }

  const baseIntent: EnvelopeIntent = {
    ...(fixtureId ? { fixtureId } : {}),
    scope: 'roof_takeoff',
    scale,
    units: 'm',
    north,
    profileFamily,
    windZone,
    ventedRidge,
    eaveHeightM,
    pitchDeg,
    bodies: [],
    flashingHints,
    openings: [],
    evidence,
    blockers: []
  };

  if (!scale || !scaleDenom) {
    return {
      ...baseIntent,
      blockers: ['missing scale']
    };
  }

  const mmPerMetre = 1000 / scaleDenom;

  // Exclude sheet border, title block, flashing detail box, and scale bar boxes
  const titleBlockBox = findEnclosingBoxForText(allRects, lines, (l) =>
    /TEST PLAN|NOT FOR CONSTRUCTION|Project:|Sheet:/i.test(l.text)
  );
  const detailBox = findEnclosingBoxForText(allRects, lines, (l) =>
    /FLASHING DETAIL|\bFD-\d+\b/i.test(l.text)
  );
  const scaleBarLines = lines.filter((l) => /Scale bar|is drawn so/i.test(l.text));
  const scaleBarBox: BoxRegion | null =
    scaleBarLines.length > 0
      ? {
          minX: Math.min(...scaleBarLines.map((l) => l.xMinMm)) - 5,
          minY: Math.min(...scaleBarLines.map((l) => l.yMm)) - 5,
          maxX: Math.max(...scaleBarLines.map((l) => l.xMaxMm)) + 15,
          maxY: Math.max(...scaleBarLines.map((l) => l.yMm)) + 20
        }
      : null;

  const isSheetBorderSeg = (s: VectorSegment): boolean => {
    const nearLeft = s.x1 <= 12 && s.x2 <= 12;
    const nearRight = s.x1 >= pageWidthMm - 12 && s.x2 >= pageWidthMm - 12;
    const nearBot = s.y1 <= 12 && s.y2 <= 12;
    const nearTop = s.y1 >= pageHeightMm - 12 && s.y2 >= pageHeightMm - 12;
    return (
      (nearLeft && Math.abs(s.y2 - s.y1) > pageHeightMm * 0.6) ||
      (nearRight && Math.abs(s.y2 - s.y1) > pageHeightMm * 0.6) ||
      (nearBot && Math.abs(s.x2 - s.x1) > pageWidthMm * 0.6) ||
      (nearTop && Math.abs(s.x2 - s.x1) > pageWidthMm * 0.6)
    );
  };

  const drawingSegments = allSegments.filter((seg) => {
    if (isSheetBorderSeg(seg)) return false;
    if (titleBlockBox && segmentInBox(seg, titleBlockBox)) return false;
    if (detailBox && segmentInBox(seg, detailBox)) return false;
    if (scaleBarBox && segmentInBox(seg, scaleBarBox)) return false;
    return true;
  });

  const drawingRects = findClosedRectangles(drawingSegments).sort(
    (a, b) => (b.maxX - b.minX) * (b.maxY - b.minY) - (a.maxX - a.minX) * (a.maxY - a.minY)
  );

  // Extract dimension numbers (mm, e.g. 12000, 7000) strictly from the drawing area
  const drawingTokens = tokens.filter((tok) => {
    if (titleBlockBox && pointInBox(tok.xMm, tok.yMm, titleBlockBox)) return false;
    if (detailBox && pointInBox(tok.xMm, tok.yMm, detailBox)) return false;
    if (scaleBarBox && pointInBox(tok.xMm, tok.yMm, scaleBarBox)) return false;
    return /^\d{4,6}$/.test(tok.text);
  });

  const dimValuesM = drawingTokens.map((tok) => ({
    valM: Number(tok.text) / 1000,
    xMm: tok.xMm,
    yMm: tok.yMm
  }));

  let chosenRect: BoxRegion | null = drawingRects[0] ?? null;

  if (drawingRects.length > 0 && dimValuesM.length >= 2) {
    // Prefer the largest closed rectangle matching the printed dimension strings within 0.05 m
    const matching = drawingRects.find((rect) => {
      const rwM = (rect.maxX - rect.minX) / mmPerMetre;
      const rhM = (rect.maxY - rect.minY) / mmPerMetre;
      const sortedRect = [rwM, rhM].sort((a, b) => a - b);
      for (let i = 0; i < dimValuesM.length; i++) {
        for (let j = i + 1; j < dimValuesM.length; j++) {
          const sortedDims = [dimValuesM[i].valM, dimValuesM[j].valM].sort((a, b) => a - b);
          if (
            Math.abs(sortedRect[0] - sortedDims[0]) <= 0.05 &&
            Math.abs(sortedRect[1] - sortedDims[1]) <= 0.05
          ) {
            return true;
          }
        }
      }
      return false;
    });

    if (!matching) {
      return {
        ...baseIntent,
        bodies: [],
        blockers: ['dimension mismatch']
      };
    }
    chosenRect = matching;
  }

  if (!chosenRect) {
    return {
      ...baseIntent,
      bodies: [],
      blockers: ['missing roof outline']
    };
  }

  // Also check explicit dimension mismatch against the chosen rectangle if dimension tokens exist
  const widthM = roundM((chosenRect.maxX - chosenRect.minX) / mmPerMetre);
  const heightM = roundM((chosenRect.maxY - chosenRect.minY) / mmPerMetre);
  if (dimValuesM.length >= 2) {
    const nearXDim = dimValuesM.find(
      (d) => d.xMm >= chosenRect!.minX - 5 && d.xMm <= chosenRect!.maxX + 5 && d.yMm < chosenRect!.minY
    );
    const nearYDim = dimValuesM.find(
      (d) => d.yMm >= chosenRect!.minY - 5 && d.yMm <= chosenRect!.maxY + 5 && d.xMm < chosenRect!.minX
    );
    if (nearXDim && Math.abs(widthM - nearXDim.valM) > 0.05) {
      return { ...baseIntent, bodies: [], blockers: ['dimension mismatch'] };
    }
    if (nearYDim && Math.abs(heightM - nearYDim.valM) > 0.05) {
      return { ...baseIntent, bodies: [], blockers: ['dimension mismatch'] };
    }
  }

  // Translate origin to lower-left corner (0, 0), counter-clockwise: South, East, North, West
  const outline: TriagePoint2D[] = [
    { x: 0, y: 0 },
    { x: widthM, y: 0 },
    { x: widthM, y: heightM },
    { x: 0, y: heightM }
  ];

  const pageEdgesMm: Array<{ a: TriagePoint2D; b: TriagePoint2D }> = [
    { a: { x: chosenRect.minX, y: chosenRect.minY }, b: { x: chosenRect.maxX, y: chosenRect.minY } }, // South
    { a: { x: chosenRect.maxX, y: chosenRect.minY }, b: { x: chosenRect.maxX, y: chosenRect.maxY } }, // East
    { a: { x: chosenRect.maxX, y: chosenRect.maxY }, b: { x: chosenRect.minX, y: chosenRect.maxY } }, // North
    { a: { x: chosenRect.minX, y: chosenRect.maxY }, b: { x: chosenRect.minX, y: chosenRect.minY } } // West
  ];

  const edgeLabelTokens = tokens.filter((tok) =>
    /^(EAVE|GABLE|WALL|APRON)$/i.test(tok.text.trim())
  );

  const classifyEdgeType = (edgeIdx: number): { type: TriageEdgeType; eaveHeightM?: number } => {
    const edgeSeg = pageEdgesMm[edgeIdx];
    let bestTok: TextToken | null = null;
    let bestDist = 25; // max 25 mm from edge
    for (const tok of edgeLabelTokens) {
      const cx = tok.xMm + tok.widthMm / 2;
      const cy = tok.yMm + tok.heightMm / 2;
      const d = distToSegmentMm({ x: cx, y: cy }, edgeSeg.a, edgeSeg.b);
      if (d < bestDist) {
        bestDist = d;
        bestTok = tok;
      }
    }
    if (!bestTok) return { type: 'unclassified' };
    const upper = bestTok.text.trim().toUpperCase();
    if (upper === 'EAVE') {
      return {
        type: 'eave',
        ...(eaveHeightM !== null ? { eaveHeightM } : {})
      };
    }
    if (upper === 'GABLE') return { type: 'gable' };
    if (upper === 'WALL') return { type: 'wall' };
    if (upper === 'APRON') return { type: 'apron' };
    return { type: 'unclassified' };
  };

  const edges = [0, 1, 2, 3].map((idx) => classifyEdgeType(idx));

  // Detect interior structural ridge segments inside the roof rectangle
  const interiorSegs = drawingSegments.filter((seg) => {
    const mx = (seg.x1 + seg.x2) / 2;
    const my = (seg.y1 + seg.y2) / 2;
    const insideX = mx > chosenRect!.minX + 1.5 && mx < chosenRect!.maxX - 1.5;
    const insideY = my > chosenRect!.minY + 1.5 && my < chosenRect!.maxY - 1.5;
    if (!insideX || !insideY) return false;
    const onBoundary =
      (Math.abs(seg.y1 - chosenRect!.minY) <= 0.6 && Math.abs(seg.y2 - chosenRect!.minY) <= 0.6) ||
      (Math.abs(seg.y1 - chosenRect!.maxY) <= 0.6 && Math.abs(seg.y2 - chosenRect!.maxY) <= 0.6) ||
      (Math.abs(seg.x1 - chosenRect!.minX) <= 0.6 && Math.abs(seg.x2 - chosenRect!.minX) <= 0.6) ||
      (Math.abs(seg.x1 - chosenRect!.maxX) <= 0.6 && Math.abs(seg.x2 - chosenRect!.maxX) <= 0.6);
    return !onBoundary;
  });

  // Merge colinear horizontal/vertical interior spans (supports dashed lines or single strokes)
  const horizInterior = mergeAxisSpans(
    interiorSegs
      .filter((s) => Math.abs(s.y2 - s.y1) <= 0.5)
      .map((s) => ({
        coord: (s.y1 + s.y2) / 2,
        min: Math.min(s.x1, s.x2),
        max: Math.max(s.x1, s.x2)
      })),
    0.5,
    8
  );
  const vertInterior = mergeAxisSpans(
    interiorSegs
      .filter((s) => Math.abs(s.x2 - s.x1) <= 0.5)
      .map((s) => ({
        coord: (s.x1 + s.x2) / 2,
        min: Math.min(s.y1, s.y2),
        max: Math.max(s.y1, s.y2)
      })),
    0.5,
    8
  );

  const ridgeTokens = tokens.filter((tok) => /^RIDGE$/i.test(tok.text.trim()));
  const skeleton: EnvelopeIntent['bodies'][number]['skeleton'] = [];

  for (const hSpan of horizInterior) {
    const spanLen = hSpan.max - hSpan.min;
    const rectW = chosenRect.maxX - chosenRect.minX;
    const nearRidgeLabel = ridgeTokens.some(
      (rt) => Math.abs(rt.yMm - hSpan.coord) <= 12 && rt.xMm >= hSpan.min - 15 && rt.xMm <= hSpan.max + 15
    );
    if (spanLen >= rectW * 0.5 || nearRidgeLabel) {
      skeleton.push({
        type: 'ridge',
        from: {
          x: roundM((hSpan.min - chosenRect.minX) / mmPerMetre),
          y: roundM((hSpan.coord - chosenRect.minY) / mmPerMetre)
        },
        to: {
          x: roundM((hSpan.max - chosenRect.minX) / mmPerMetre),
          y: roundM((hSpan.coord - chosenRect.minY) / mmPerMetre)
        }
      });
    }
  }

  for (const vSpan of vertInterior) {
    const spanLen = vSpan.max - vSpan.min;
    const rectH = chosenRect.maxY - chosenRect.minY;
    const nearRidgeLabel = ridgeTokens.some(
      (rt) => Math.abs(rt.xMm - vSpan.coord) <= 12 && rt.yMm >= vSpan.min - 15 && rt.yMm <= vSpan.max + 15
    );
    if (spanLen >= rectH * 0.5 || nearRidgeLabel) {
      skeleton.push({
        type: 'ridge',
        from: {
          x: roundM((vSpan.coord - chosenRect.minX) / mmPerMetre),
          y: roundM((vSpan.min - chosenRect.minY) / mmPerMetre)
        },
        to: {
          x: roundM((vSpan.coord - chosenRect.minX) / mmPerMetre),
          y: roundM((vSpan.max - chosenRect.minY) / mmPerMetre)
        }
      });
    }
  }

  return {
    ...baseIntent,
    bodies: [
      {
        id: 'body-1',
        outline,
        holes: [],
        edges,
        skeleton,
        pitchDeg
      }
    ],
    blockers: []
  };
}
