import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  EnvelopeIntent,
  EnvelopeIntentAreaMetric,
  EnvelopeIntentFlashingHint,
  EnvelopeIntentHeightMetric,
  EnvelopeIntentPageInfo,
  TriageEdgeType,
  TriagePageRole,
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
  isRotated90: boolean;
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

function distToSegmentMm(
  pt: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(pt.x - a.x, pt.y - a.y);
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2));
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
}

function isPointInPolygonMm(pt: TriagePoint2D, poly: TriagePoint2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function getLoopBounds(loop: TriagePoint2D[]): BoxRegion {
  const xs = loop.map((p) => p.x);
  const ys = loop.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function polygonSignedArea(poly: TriagePoint2D[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function simplifyCollinearLoop(poly: TriagePoint2D[], tolMm = 0.2): TriagePoint2D[] {
  let pts = [...poly];
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    const nextPts: TriagePoint2D[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const cur = pts[i];
      const next = pts[(i + 1) % pts.length];
      const d = distToSegmentMm(cur, prev, next);
      if (d <= tolMm && Math.hypot(next.x - prev.x, next.y - prev.y) > 0.2) {
        changed = true;
      } else {
        nextPts.push(cur);
      }
    }
    pts = nextPts;
  }
  return pts;
}

function rotateLoopToLowerLeft(poly: TriagePoint2D[]): TriagePoint2D[] {
  if (poly.length === 0) return poly;
  let bestIdx = 0;
  for (let i = 1; i < poly.length; i++) {
    const cur = poly[i];
    const best = poly[bestIdx];
    if (cur.y < best.y - 0.5 || (Math.abs(cur.y - best.y) <= 0.5 && cur.x < best.x)) {
      bestIdx = i;
    }
  }
  return [...poly.slice(bestIdx), ...poly.slice(0, bestIdx)];
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

/**
 * Joins all text items sharing the same horizontal baseline (regardless of column spacing)
 * and collapses split ratio characters such as "1" ":" "100" -> "1:100".
 */
function groupBaselineLines(tokens: TextToken[]): TextLine[] {
  const sorted = [...tokens].sort((a, b) => b.yMm - a.yMm || a.xMm - b.xMm);
  const rows: TextToken[][] = [];
  for (const tok of sorted) {
    const tol = Math.max(2.2, tok.heightMm * 0.55);
    const existing = rows.find((row) => Math.abs(row[0].yMm - tok.yMm) <= tol);
    if (existing) {
      existing.push(tok);
    } else {
      rows.push([tok]);
    }
  }

  return rows.map((row) => {
    const ordered = [...row].sort((a, b) => a.xMm - b.xMm);
    let combined = '';
    let prevEndX: number | null = null;
    for (const item of ordered) {
      if (prevEndX !== null && item.xMm - prevEndX > 0.8) {
        combined += ' ';
      }
      combined += item.text;
      prevEndX = item.xMm + Math.max(item.widthMm, item.text.length * 1.4);
    }
    const normalized = combined
      .replace(/\s+/g, ' ')
      .replace(/\b1\s*:\s*(\d{1,4})\b/g, '1:$1')
      .trim();
    return {
      text: normalized,
      xMinMm: Math.min(...ordered.map((t) => t.xMm)),
      xMaxMm: Math.max(...ordered.map((t) => t.xMm + Math.max(t.widthMm, t.text.length * 1.4))),
      yMm: ordered.reduce((s, t) => s + t.yMm, 0) / ordered.length,
      tokens: ordered
    };
  });
}

function classifyRoleFromText(titleText: string): TriagePageRole {
  const t = titleText.trim();
  if (!t) return 'other';
  if ((/\bdetails?\b/i.test(t) || /\bFD-\d+\b/i.test(t)) && !/roof\s*plan/i.test(t)) {
    return 'details';
  }
  if (/\bsite\b/i.test(t)) return 'site';
  if (/\broof\b/i.test(t)) return 'roof';
  if (/\bfloor\b/i.test(t)) return 'floor';
  if (/\belevation/i.test(t)) return 'elevation';
  return 'other';
}

function extractPageTitle(
  splitLines: TextLine[],
  baselineLines: TextLine[],
  pageWidthMm: number,
  pageHeightMm: number,
  pageNumber: number
): string {
  const candidates = [...splitLines, ...baselineLines];
  const explicitTitles: string[] = [];
  for (const line of candidates) {
    const sheetMatch = line.text.match(
      /^(?:Sheet|Drawing(?:\s+Title)?|Dwg(?:\s+Title)?|Title)\s*[:\-]\s*(.+)$/i
    );
    if (sheetMatch) {
      const val = sheetMatch[1].trim();
      if (val && !/NOT FOR CONSTRUCTION/i.test(val) && !/\bLOT\s+\d+\s+D\.?P\.?/i.test(val)) {
        explicitTitles.push(val);
      }
    }
  }

  const roleExplicit = explicitTitles.find(
    (t) => classifyRoleFromText(t) !== 'other' || /\bdetails?\b/i.test(t)
  );
  if (roleExplicit) return roleExplicit;

  const isSheetTitleLine = (l: TextLine) =>
    l.text.length <= 90 &&
    /(?:roof\s*plan|(?:existing|proposed)?\s*site\s*plan|floor\s*plan|elevations?|details?|sections?)/i.test(
      l.text
    ) &&
    !/^(?:Scale bar|NOTE|REFER TO|SEE )/i.test(l.text);

  const isInTitleBlockZone = (l: TextLine) =>
    l.yMm <= pageHeightMm * 0.3 || l.xMaxMm >= pageWidthMm * 0.65;

  // Prefer sheet title lines inside title block zone or large heading font
  const titleBlockMatches = splitLines.filter(
    (l) =>
      isSheetTitleLine(l) &&
      (isInTitleBlockZone(l) || Math.max(...l.tokens.map((t) => t.heightMm)) >= 3.2)
  );
  const pickedTitleLine =
    titleBlockMatches[0] ?? splitLines.find((l) => isSheetTitleLine(l)) ?? null;

  if (pickedTitleLine) {
    return explicitTitles[0] &&
      !/\b(?:site|floor|roof|elevation|detail)\b/i.test(explicitTitles[0])
      ? `${explicitTitles[0]} — ${pickedTitleLine.text}`
      : pickedTitleLine.text;
  }

  if (explicitTitles.length > 0) return explicitTitles[0];

  let bestByHeight: { text: string; height: number } | null = null;
  for (const line of splitLines) {
    if (/TEST PLAN|NOT FOR CONSTRUCTION|GENERAL NOTES|\bLOT\s+\d+\s+D\.?P\.?/i.test(line.text)) {
      continue;
    }
    if (!/[A-Za-z]{3,}/.test(line.text)) continue;
    const maxH = Math.max(...line.tokens.map((t) => t.heightMm));
    if (!bestByHeight || maxH > bestByHeight.height) {
      bestByHeight = { text: line.text, height: maxH };
    }
  }
  if (bestByHeight && bestByHeight.height >= 3.2) {
    return bestByHeight.text;
  }

  const firstText = splitLines.find(
    (l) =>
      l.text.length >= 4 &&
      /[A-Za-z]{3,}/.test(l.text) &&
      !/NOT FOR CONSTRUCTION|\bLOT\s+\d+\s+D\.?P\.?/i.test(l.text)
  );
  return firstText ? firstText.text : `Page ${pageNumber}`;
}

function detectIsoSheetCode(pageWidthMm: number, pageHeightMm: number): string | null {
  const longSide = Math.max(pageWidthMm, pageHeightMm);
  const shortSide = Math.min(pageWidthMm, pageHeightMm);
  const sizes: Array<{ code: string; w: number; h: number }> = [
    { code: 'A0', w: 1189, h: 841 },
    { code: 'A1', w: 841, h: 594 },
    { code: 'A2', w: 594, h: 420 },
    { code: 'A3', w: 420, h: 297 },
    { code: 'A4', w: 297, h: 210 }
  ];
  for (const s of sizes) {
    if (Math.abs(longSide - s.w) <= 25 && Math.abs(shortSide - s.h) <= 25) {
      return s.code;
    }
  }
  return null;
}

function extractScaleCandidates(
  baselineLines: TextLine[],
  splitLines: TextLine[],
  pageWidthMm: number,
  pageHeightMm: number
): number[] {
  const normalizeRatio = (s: string) => s.replace(/\b1\s*:\s*(\d{1,4})\b/g, '1:$1');
  const searchLines = [
    ...baselineLines.map((l) => normalizeRatio(l.text)),
    ...splitLines.map((l) => normalizeRatio(l.text))
  ];
  const fullNormalized = searchLines.join('\n');
  const candidates: number[] = [];
  const pushDenom = (denom: number) => {
    if (Number.isFinite(denom) && denom > 0 && !candidates.includes(denom)) {
      candidates.push(denom);
    }
  };

  // 1. Sheet-size qualified scale matching current page dimensions (e.g. "1:100 @ A3")
  const sheetCode = detectIsoSheetCode(pageWidthMm, pageHeightMm);
  if (sheetCode) {
    const pageSizeRegex = new RegExp(`\\b1:(\\d{1,4})\\s*(?:@|at)\\s*${sheetCode}\\b`, 'ig');
    for (const m of fullNormalized.matchAll(pageSizeRegex)) {
      pushDenom(Number(m[1]));
    }
  }

  // 2. Slash-separated multi-scale expressions e.g. "1:50 / 1:100" or "SCALE 1:50 / 1:100"
  for (const text of searchLines) {
    const slashMatches = [...text.matchAll(/\b1:(\d{1,4})\s*\/\s*1:(\d{1,4})\b/g)];
    for (const m of slashMatches) {
      pushDenom(Number(m[1]));
      pushDenom(Number(m[2]));
    }
  }

  // 3. Explicit SCALE keyword + ratio on same baseline (e.g. "SCALE 1:100", "Scale: 1:100")
  for (const text of searchLines) {
    const m =
      text.match(/\bSCALE\b(?:\s*[:=])?\s*1:(\d{1,4})\b/i) ??
      text.match(/\bSCALE\b[^\n]*\b1:(\d{1,4})\b/i);
    if (m) {
      pushDenom(Number(m[1]));
    }
  }

  // 4. Ratio with paper size qualifier ("1:100 @ A1", "1:100 at A3")
  for (const m of fullNormalized.matchAll(/\b1:(\d{1,4})\s*(?:@|at)\s*A[0-4]\b/ig)) {
    pushDenom(Number(m[1]));
  }

  // 5. Scale bar / explanation text
  for (const m of fullNormalized.matchAll(
    /\b1:(\d{1,4})\b(?=[^\n]*(?:is drawn|mm on the page|scale))/ig
  )) {
    pushDenom(Number(m[1]));
  }

  // 6. Vertical title-block pair: "SCALE" directly above "1:100" (or "1:50 / 1:100")
  const scaleHeaderLines = splitLines.filter((l) => /\bSCALE\b/i.test(l.text));
  for (const hdr of scaleHeaderLines) {
    const below = splitLines.find((l) => {
      const dy = hdr.yMm - l.yMm;
      const dxOverlap = l.xMaxMm >= hdr.xMinMm - 25 && l.xMinMm <= hdr.xMaxMm + 25;
      return dy > 0.5 && dy <= 16 && dxOverlap && /\b1:\d{1,4}\b/.test(normalizeRatio(l.text));
    });
    if (below) {
      for (const m of normalizeRatio(below.text).matchAll(/\b1:(\d{1,4})\b/g)) {
        pushDenom(Number(m[1]));
      }
    }
  }

  // 7. Standalone standard architectural metric scale ratio (excludes e.g. 1:12 pitch)
  for (const m of fullNormalized.matchAll(
    /\b1:(10|20|25|50|75|100|125|150|200|250|300|400|500|1000)\b/g
  )) {
    pushDenom(Number(m[1]));
  }

  return candidates;
}

function extractWindZone(text: string): TriageWindZone | null {
  const m = text.match(
    /Wind\s*(?:zone|speed)?\s*[:=\-]?\s*(Extra\s*High|Very\s*High|High|Medium|Low|EH|VH|H|M|L)\b(?:\s*\((EH|VH|H|M|L)\))?/i
  );
  if (!m) {
    const paren = text.match(/Wind\s*(?:zone)?[^\n]*\((EH|VH|H|M|L)\)/i);
    if (paren) return paren[1].toUpperCase() as TriageWindZone;
    return null;
  }
  const raw = (m[2] || m[1]).toUpperCase().replace(/\s+/g, ' ').trim();
  if (raw === 'EXTRA HIGH' || raw === 'EH') return 'EH';
  if (raw === 'VERY HIGH' || raw === 'VH') return 'VH';
  if (raw === 'HIGH' || raw === 'H') return 'H';
  if (raw === 'MEDIUM' || raw === 'M') return 'M';
  if (raw === 'LOW' || raw === 'L') return 'L';
  return null;
}

function extractPitchDeg(
  splitLines: TextLine[],
  baselineLines: TextLine[],
  role: TriagePageRole
): number | null {
  const isIgnoredBoundaryRuleLine = (text: string) =>
    /\b(?:H?IRB|Unitary\s+Plan|recession|height\s+in\s+relation\s+to\s+boundary)\b/i.test(text);

  const safeLines = [...baselineLines, ...splitLines].filter(
    (l) => !isIgnoredBoundaryRuleLine(l.text)
  );

  // 1. Explicit pitch note ("Pitch: 22.5 degrees", "Roof pitch 15°")
  for (const l of safeLines) {
    const m =
      l.text.match(/\b(?:roof\s+)?pitch\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:degrees?|deg|°)/i) ??
      l.text.match(/\b(\d+(?:\.\d+)?)\s*(?:degrees?|deg|°)\s*(?:roof\s+)?pitch\b/i);
    if (m) {
      const val = Number(m[1]);
      if (Number.isFinite(val) && val > 0 && val < 85) return val;
    }
  }

  // 2. Roof-plan fall arrow label (only on roof pages)
  if (role === 'roof') {
    for (const l of safeLines) {
      if (/(?:north|wind|scale|hirb|hrb|boundary|recession|unitary|detail)/i.test(l.text)) continue;
      // Match short fall-arrow annotation like "22.5°" or "15.0°"
      const m = l.text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*°(?:\s|$)/);
      if (m && l.text.length <= 24) {
        const val = Number(m[1]);
        if (Number.isFinite(val) && val > 0 && val < 85) return val;
      }
    }
  }

  return null;
}

/**
 * Fallback pitch reader for NZ elevation sheets where pitch is only stated on a
 * "UNITARY PLAN / HIRB 2.5m & 45°" callout on an elevation page.
 */
function extractElevationUnitaryPitchDeg(splitLines: TextLine[], baselineLines: TextLine[]): number | null {
  const all = [...splitLines, ...baselineLines];
  const headerLines = all.filter((l) => /\b(?:UNITARY\s+PLAN|HIRB)\b/i.test(l.text));
  if (headerLines.length === 0) return null;

  for (const l of headerLines) {
    const m = l.text.match(/(\d+(?:\.\d+)?)\s*°/);
    if (m) {
      const val = Number(m[1]);
      if (Number.isFinite(val) && val > 0 && val < 85) return val;
    }
  }

  for (const h of headerLines) {
    for (const candidate of splitLines) {
      if (candidate === h) continue;
      if (Math.abs(candidate.yMm - h.yMm) > 15) continue;
      const horizGap = Math.max(0, candidate.xMinMm - h.xMaxMm, h.xMinMm - candidate.xMaxMm);
      if (horizGap > 35) continue;
      const m = candidate.text.match(/(\d+(?:\.\d+)?)\s*°/);
      if (m) {
        const val = Number(m[1]);
        if (Number.isFinite(val) && val > 0 && val < 85) return val;
      }
    }
  }
  return null;
}

function extractEaveHeightM(splitLines: TextLine[], baselineLines: TextLine[]): number | null {
  const allLines = [...splitLines, ...baselineLines];
  for (const l of allLines) {
    if (!/\b(?:eave|eaves|fascia)\b/i.test(l.text)) continue;
    if (/\b(?:H?IRB|recession|boundary|unitary)\b/i.test(l.text)) continue;
    const mMetres = l.text.match(/(\d+(?:\.\d+)?)\s*m\b/i);
    if (mMetres) {
      const val = Number(mMetres[1]);
      if (Number.isFinite(val) && val > 0 && val < 30) return val;
    }
    const mMm = l.text.match(/(\d{3,5})\s*mm\b/i);
    if (mMm) {
      const val = Number(mMm[1]) / 1000;
      if (Number.isFinite(val) && val > 0 && val < 30) return val;
    }
  }
  return null;
}

function extractAreaMetrics(
  splitLines: TextLine[],
  baselineLines: TextLine[],
  pageNumber: number
): EnvelopeIntentAreaMetric[] {
  const seen = new Set<string>();
  const results: EnvelopeIntentAreaMetric[] = [];
  const areaRegex =
    /((?:(?:Net|Gross|Proposed|Existing|Total|Main|Upper|Lower|Site|Roof|Floor|Footprint|Building|Deck|Garage|Coverage)\s+)*Area|(?:Net|Gross|Proposed|Existing|Total|Main|Upper|Lower|Site|Roof|Floor|Footprint|Building|Deck|Garage)\s+(?:Coverage|Footprint))\s*[:=\-]?\s*(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|sq\.?\s*m)(?=$|[\s.,;)/])/gi;

  for (const line of [...splitLines, ...baselineLines]) {
    if (/\b(?:H?IRB|Unitary\s+Plan|recession|boundary)\b/i.test(line.text)) continue;
    for (const m of line.text.matchAll(areaRegex)) {
      const label = m[1].replace(/\s+/g, ' ').trim();
      const valueM2 = Number(m[2]);
      if (!label || !Number.isFinite(valueM2) || valueM2 <= 0) continue;
      const key = `${pageNumber}|${label.toLowerCase()}|${valueM2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ label, valueM2, page: pageNumber });
    }
  }
  return results;
}

function extractHeightMetrics(
  splitLines: TextLine[],
  baselineLines: TextLine[],
  pageNumber: number
): EnvelopeIntentHeightMetric[] {
  const seen = new Set<string>();
  const results: EnvelopeIntentHeightMetric[] = [];
  const pushMetric = (
    kind: EnvelopeIntentHeightMetric['kind'],
    rawNum: string,
    unit: string | undefined,
    raw: string
  ) => {
    let val = Number(rawNum);
    if (!Number.isFinite(val) || val <= 0) return;
    if (unit && unit.toLowerCase() === 'mm') val = val / 1000;
    if (kind !== 'rl' && kind !== 'ffl' && val >= 40) return;
    const rounded = roundM(val);
    const key = `${pageNumber}|${kind}|${rounded}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ kind, valueM: rounded, page: pageNumber, raw });
  };

  for (const line of [...splitLines, ...baselineLines]) {
    const text = line.text;
    if (/\b(?:H?IRB|Unitary\s+Plan|recession|boundary)\b/i.test(text)) continue;

    let matchedSpecific = false;
    const fflMatch = text.match(/\bF\.?F\.?L\.?\s*[:=@]?\s*[+]?\s*(\d+(?:\.\d+)?)\s*(mm|m)?\b/i);
    if (fflMatch) {
      pushMetric('ffl', fflMatch[1], fflMatch[2], fflMatch[0]);
      matchedSpecific = true;
    }

    const eaveMatch = text.match(
      /\b(?:eave|eaves|fascia)(?:\s+height)?(?:\s+RL)?\s*[:=@]?\s*(\d+(?:\.\d+)?)\s*(mm|m)\b/i
    );
    if (eaveMatch) {
      pushMetric('eave', eaveMatch[1], eaveMatch[2], eaveMatch[0]);
      matchedSpecific = true;
    }

    const ridgeMatch = text.match(
      /\b(?:ridge|apex)(?:\s+(?:height|RL))?\s*[:=@]?\s*(\d+(?:\.\d+)?)\s*(mm|m)\b/i
    );
    if (ridgeMatch) {
      pushMetric('ridge', ridgeMatch[1], ridgeMatch[2], ridgeMatch[0]);
      matchedSpecific = true;
    }

    if (!matchedSpecific) {
      const rlMatch = text.match(/\bR\.?L\.?\s*[:=@]?\s*(\d+(?:\.\d+)?)\s*(mm|m)?\b/i);
      if (rlMatch) {
        pushMetric('rl', rlMatch[1], rlMatch[2], rlMatch[0]);
      }
    }
  }
  return results;
}

function extractFlashingHintsFromLines(
  lines: TextLine[],
  defaultVentedRidge: TriageVentedRidge | null
): EnvelopeIntentFlashingHint[] {
  const hints: EnvelopeIntentFlashingHint[] = [];
  for (let i = 0; i < lines.length; i++) {
    const fdMatch = lines[i].text.match(/\b(FD-\d+)\s+([A-Z]+)\s*[:\-]\s*(.+)/i);
    if (!fdMatch) continue;
    const chunkText = [lines[i].text, lines[i + 1]?.text ?? ''].join(' ');
    const coverMatch = chunkText.match(/Cover\s+(\d+(?:\.\d+)?)\s*mm/i);
    const fdVentedMatch = chunkText.match(/Vented\s*ridge\s*[:=]?\s*(none|RV10P)\b/i);
    hints.push({
      detail: fdMatch[1].toUpperCase(),
      kind: fdMatch[2].toLowerCase(),
      coverMm: coverMatch ? Number(coverMatch[1]) : null,
      ventedRidge: fdVentedMatch
        ? ((fdVentedMatch[1].toUpperCase() === 'RV10P' ? 'RV10P' : 'none') as TriageVentedRidge)
        : defaultVentedRidge
    });
  }
  return hints;
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
      const isFillOnly = paintOp === OPS.fill || paintOp === OPS.eoFill;
      if (strokeOps.has(paintOp) || isFillOnly) {
        const dataArr = args[1] || [];
        const constructed: VectorSegment[] = [];
        for (const chunk of dataArr) {
          if (chunk && typeof chunk.length === 'number') {
            parseSubOps(chunk, ctm, constructed);
          }
        }
        if (strokeOps.has(paintOp)) {
          segments.push(...constructed);
        } else if (constructed.length >= 3) {
          const xs = constructed.flatMap((s) => [s.x1, s.x2]);
          const ys = constructed.flatMap((s) => [s.y1, s.y2]);
          const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          if (span >= 8) {
            segments.push(...constructed);
          }
        }
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
    } else if (fn === OPS.fill || fn === OPS.eoFill) {
      if (pending.length >= 3) {
        const xs = pending.flatMap((s) => [s.x1, s.x2]);
        const ys = pending.flatMap((s) => [s.y1, s.y2]);
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        if (span >= 8) {
          segments.push(...pending);
        }
      }
      pending = [];
    } else if (fn === OPS.endPath) {
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

/**
 * Extracts closed external perimeter loops (supporting rectangles, L/T/U shapes, and arbitrary polygons)
 * from planar vector segments by pruning dangling degree<=1 edges, splitting T-junctions,
 * and tracing the outer boundary face of each connected component.
 */
function extractClosedExternalLoops(
  segments: VectorSegment[],
  pageWidthMm: number,
  pageHeightMm: number,
  snapEps = 0.45
): TriagePoint2D[][] {
  if (segments.length < 3) return [];

  const verts: TriagePoint2D[] = [];
  const getOrAddVert = (x: number, y: number): number => {
    for (let i = 0; i < verts.length; i++) {
      if (Math.hypot(verts[i].x - x, verts[i].y - y) <= snapEps) {
        return i;
      }
    }
    verts.push({ x, y });
    return verts.length - 1;
  };

  const rawEdges: Array<[number, number]> = [];
  for (const seg of segments) {
    if (segLength(seg) < 0.8) continue;
    const u = getOrAddVert(seg.x1, seg.y1);
    const v = getOrAddVert(seg.x2, seg.y2);
    if (u !== v) rawEdges.push([u, v]);
  }

  // Split edges at any vertex lying on the interior of an edge (handles interior wall T-junctions)
  const splitEdges: Array<[number, number]> = [];
  for (const [u, v] of rawEdges) {
    const a = verts[u];
    const b = verts[v];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 1e-6) continue;

    const interiorHits: Array<{ idx: number; t: number }> = [];
    for (let k = 0; k < verts.length; k++) {
      if (k === u || k === v) continue;
      const p = verts[k];
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      if (t <= 0.005 || t >= 0.995) continue;
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      if (Math.hypot(p.x - projX, p.y - projY) <= snapEps) {
        interiorHits.push({ idx: k, t });
      }
    }

    if (interiorHits.length === 0) {
      splitEdges.push([u, v]);
    } else {
      interiorHits.sort((h1, h2) => h1.t - h2.t);
      let prevIdx = u;
      for (const hit of interiorHits) {
        if (hit.idx !== prevIdx) {
          splitEdges.push([prevIdx, hit.idx]);
          prevIdx = hit.idx;
        }
      }
      if (v !== prevIdx) splitEdges.push([prevIdx, v]);
    }
  }

  // Deduplicate undirected edges
  const adj = new Map<number, Set<number>>();
  const addUndirected = (u: number, v: number) => {
    if (u === v) return;
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  };
  for (const [u, v] of splitEdges) addUndirected(u, v);

  // Iteratively prune degree <= 1 vertices (removes witness lines, dimension ticks, dashed ridges)
  const queue: number[] = [];
  for (const [v, nbrs] of adj.entries()) {
    if (nbrs.size <= 1) queue.push(v);
  }
  while (queue.length > 0) {
    const v = queue.pop()!;
    const nbrs = adj.get(v);
    if (!nbrs) continue;
    for (const n of nbrs) {
      const nSet = adj.get(n);
      if (nSet) {
        nSet.delete(v);
        if (nSet.size <= 1) queue.push(n);
      }
    }
    adj.delete(v);
  }

  if (adj.size < 3) return [];

  // Partition into connected components
  const visitedComp = new Set<number>();
  const components: number[][] = [];
  for (const startV of adj.keys()) {
    if (visitedComp.has(startV)) continue;
    const comp: number[] = [];
    const stack = [startV];
    visitedComp.add(startV);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nxt of adj.get(cur) || []) {
        if (!visitedComp.has(nxt)) {
          visitedComp.add(nxt);
          stack.push(nxt);
        }
      }
    }
    if (comp.length >= 3) components.push(comp);
  }

  const loops: TriagePoint2D[][] = [];

  for (const comp of components) {
    const compSet = new Set(comp);
    // Build sorted CCW outgoing edge lists per vertex
    const sortedNbrs = new Map<number, number[]>();
    for (const u of comp) {
      const nbrs = [...(adj.get(u) || [])].filter((v) => compSet.has(v));
      nbrs.sort(
        (a, b) =>
          Math.atan2(verts[a].y - verts[u].y, verts[a].x - verts[u].x) -
          Math.atan2(verts[b].y - verts[u].y, verts[b].x - verts[u].x)
      );
      sortedNbrs.set(u, nbrs);
    }

    const visitedHalf = new Set<string>();
    const edgeKey = (u: number, v: number) => `${u}->${v}`;

    let bestOuterLoop: TriagePoint2D[] | null = null;
    let bestOuterAbsArea = 0;

    for (const u of comp) {
      for (const v of sortedNbrs.get(u) || []) {
        if (visitedHalf.has(edgeKey(u, v))) continue;
        const cycleVerts: TriagePoint2D[] = [];
        let curU = u;
        let curV = v;
        let safety = 0;
        let closed = false;

        while (safety++ < comp.length * 4 + 10) {
          const key = edgeKey(curU, curV);
          if (visitedHalf.has(key)) {
            if (curU === u && curV === v && cycleVerts.length >= 3) closed = true;
            break;
          }
          visitedHalf.add(key);
          cycleVerts.push(verts[curU]);

          const nbrsAtV = sortedNbrs.get(curV) || [];
          if (nbrsAtV.length === 0) break;
          const revIdx = nbrsAtV.indexOf(curU);
          if (revIdx === -1) break;
          const nextIdx = (revIdx - 1 + nbrsAtV.length) % nbrsAtV.length;
          curU = curV;
          curV = nbrsAtV[nextIdx];
        }

        if (!closed || cycleVerts.length < 3) continue;
        const sArea = polygonSignedArea(cycleVerts);
        // Outer face of a planar component has negative signed area (CW traversal)
        if (sArea < -1 && Math.abs(sArea) > bestOuterAbsArea) {
          bestOuterAbsArea = Math.abs(sArea);
          bestOuterLoop = [...cycleVerts].reverse();
        }
      }
    }

    if (bestOuterLoop && bestOuterLoop.length >= 3) {
      const simplified = simplifyCollinearLoop(bestOuterLoop, 0.25);
      if (simplified.length >= 3) {
        const box = getLoopBounds(simplified);
        const wMm = box.maxX - box.minX;
        const hMm = box.maxY - box.minY;
        const isSheetFrame = wMm > pageWidthMm * 0.78 && hMm > pageHeightMm * 0.78;
        if (!isSheetFrame && wMm >= 8 && hMm >= 8) {
          loops.push(rotateLoopToLowerLeft(simplified));
        }
      }
    }
  }

  return loops.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
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

interface DimensionToken {
  valM: number;
  xMm: number;
  yMm: number;
  isRotated90: boolean;
}

function extractDimensionTokens(
  tokens: TextToken[],
  splitLines: TextLine[],
  titleBlockBox: BoxRegion | null,
  detailBox: BoxRegion | null,
  scaleBarBox: BoxRegion | null
): DimensionToken[] {
  const isIgnoredLine = (text: string) =>
    /\b(?:H?IRB|Unitary\s+Plan|recession|height\s+in\s+relation\s+to\s+boundary|Eave\s+height|Pitch|Scale\s*bar|Wind\s*zone|Project:|Sheet:|Drawing:|Title:|(?:Net\s+)?(?:Roof|Floor|Site|Total)\s+Area)\b/i.test(
      text
    );

  // Use column-split lines so title-block labels on the right never poison drawing dimensions on the left
  const lineByToken = new Map<TextToken, TextLine>();
  for (const line of splitLines) {
    for (const tok of line.tokens) {
      lineByToken.set(tok, line);
    }
  }

  const results: DimensionToken[] = [];

  for (const tok of tokens) {
    if (titleBlockBox && pointInBox(tok.xMm, tok.yMm, titleBlockBox)) continue;
    if (detailBox && pointInBox(tok.xMm, tok.yMm, detailBox)) continue;
    if (scaleBarBox && pointInBox(tok.xMm, tok.yMm, scaleBarBox)) continue;

    const line = lineByToken.get(tok);
    if (line && isIgnoredLine(line.text)) continue;

    const raw = tok.text.trim();
    // Skip explicit area tokens like "142.5m²" or "142.5m2" or degree tokens "22.5°"
    if (/(?:m²|m2|sqm|sq\.?m|°|deg)$/i.test(raw)) continue;

    // Parse length: (\d+\.\d+) -> metres, OR (\d{4,6}) -> millimetres
    let valM: number | null = null;
    const metreMatch = raw.match(/^(\d+\.\d+)(?:m)?$/i);
    if (metreMatch) {
      valM = Number(metreMatch[1]);
    } else {
      const mmMatch = raw.match(/^(\d{4,6})(?:mm)?$/i);
      if (mmMatch) {
        valM = Number(mmMatch[1]) / 1000;
      }
    }
    if (valM === null || !Number.isFinite(valM) || valM <= 0) continue;

    // Check immediate neighbors on the same column-split line to ignore m² values, DP numbers, and lot numbers
    if (line) {
      const ordered = [...line.tokens].sort((a, b) => a.xMm - b.xMm);
      const idx = ordered.indexOf(tok);
      const prev = idx > 0 ? ordered[idx - 1] : null;
      const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

      if (
        prev &&
        tok.xMm - (prev.xMm + Math.max(prev.widthMm, prev.text.length * 1.4)) <= 15 &&
        /(?:D\.?P\.?|LOT|SEC(?:TION)?|CT|RL|FFL|FSL|AREA|NO\.?|#)$/i.test(prev.text.trim())
      ) {
        continue;
      }
      if (
        next &&
        next.xMm - (tok.xMm + Math.max(tok.widthMm, tok.text.length * 1.4)) <= 15 &&
        /^(?:m²|m2|sqm|sq\.?m|°|deg|ha)$/i.test(next.text.trim())
      ) {
        continue;
      }
      if (/\b(?:LOT|D\.?P\.?)\b/i.test(line.text)) {
        const nearLotOrDp = line.tokens.some(
          (other) =>
            other !== tok &&
            /\b(?:LOT|D\.?P\.?)\b/i.test(other.text) &&
            Math.abs(other.xMm - tok.xMm) <= 25
        );
        if (nearLotOrDp) continue;
      }
    }

    results.push({
      valM,
      xMm: tok.xMm + tok.widthMm / 2,
      yMm: tok.yMm + tok.heightMm / 2,
      isRotated90: tok.isRotated90
    });
  }

  return results;
}

function computeOverallDimensionChains(
  dimTokens: DimensionToken[],
  drawingSegments: VectorSegment[],
  referenceBounds: BoxRegion | null
): {
  overallWidthM: number | null;
  overallHeightM: number | null;
  horizChainsM: number[];
  vertChainsM: number[];
} {
  if (dimTokens.length === 0) {
    return { overallWidthM: null, overallHeightM: null, horizChainsM: [], vertChainsM: [] };
  }

  const horizSegs = drawingSegments.filter((s) => Math.abs(s.y2 - s.y1) <= 1.0 && Math.abs(s.x2 - s.x1) >= 4);
  const vertSegs = drawingSegments.filter((s) => Math.abs(s.x2 - s.x1) <= 1.0 && Math.abs(s.y2 - s.y1) >= 4);

  const horizTokens: DimensionToken[] = [];
  const vertTokens: DimensionToken[] = [];

  for (const dt of dimTokens) {
    if (dt.isRotated90) {
      vertTokens.push(dt);
      continue;
    }
    const nearHoriz = horizSegs.some(
      (s) => distToSegmentMm({ x: dt.xMm, y: dt.yMm }, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <= 14
    );
    const nearVert = vertSegs.some(
      (s) => distToSegmentMm({ x: dt.xMm, y: dt.yMm }, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <= 14
    );
    if (nearVert && !nearHoriz) {
      vertTokens.push(dt);
    } else if (nearHoriz && !nearVert) {
      horizTokens.push(dt);
    } else if (referenceBounds) {
      const outsideLeftRight =
        (dt.xMm < referenceBounds.minX - 1 || dt.xMm > referenceBounds.maxX + 1) &&
        dt.yMm >= referenceBounds.minY - 5 &&
        dt.yMm <= referenceBounds.maxY + 5;
      const outsideTopBottom =
        (dt.yMm < referenceBounds.minY - 1 || dt.yMm > referenceBounds.maxY + 1) &&
        dt.xMm >= referenceBounds.minX - 5 &&
        dt.xMm <= referenceBounds.maxX + 5;
      if (outsideLeftRight && !outsideTopBottom) {
        vertTokens.push(dt);
      } else {
        horizTokens.push(dt);
      }
    } else {
      horizTokens.push(dt);
    }
  }

  const groupChains = (items: DimensionToken[], axis: 'y' | 'x'): number[] => {
    if (items.length === 0) return [];
    const sorted = [...items].sort((a, b) => (axis === 'y' ? a.yMm - b.yMm : a.xMm - b.xMm));
    const groups: DimensionToken[][] = [];
    for (const it of sorted) {
      const coord = axis === 'y' ? it.yMm : it.xMm;
      const grp = groups.find(
        (g) => Math.abs((axis === 'y' ? g[0].yMm : g[0].xMm) - coord) <= 4.8
      );
      if (grp) grp.push(it);
      else groups.push([it]);
    }
    return groups.map((g) => roundM(g.reduce((sum, item) => sum + item.valM, 0)));
  };

  const horizChainsM = groupChains(horizTokens, 'y');
  const vertChainsM = groupChains(vertTokens, 'x');
  const overallWidthM = horizChainsM.length > 0 ? Math.max(...horizChainsM) : null;
  const overallHeightM = vertChainsM.length > 0 ? Math.max(...vertChainsM) : null;

  return { overallWidthM, overallHeightM, horizChainsM, vertChainsM };
}

export interface ReadVectorPdfOptions {
  workerSrc?: string;
  fixtureId?: string;
  pageNumber?: number;
  manualScaleDenom?: number;
}

interface ParsedPageText {
  pageNumber: number;
  page: any;
  pageWidthMm: number;
  pageHeightMm: number;
  tokens: TextToken[];
  lines: TextLine[];
  baselineLines: TextLine[];
  fullText: string;
  baselineFullText: string;
  title: string;
  role: TriagePageRole;
  isRoofPlan: boolean;
  isDetailsSheet: boolean;
  scaleCandidates: number[];
  windZone: TriageWindZone | null;
  explicitPitchDeg: number | null;
  unitaryPitchDeg: number | null;
  eaveHeightM: number | null;
  profileFamily: string | null;
  ventedRidge: TriageVentedRidge | null;
  areas: EnvelopeIntentAreaMetric[];
  heights: EnvelopeIntentHeightMetric[];
  flashingHints: EnvelopeIntentFlashingHint[];
}

function extractProfileFamily(fullText: string): string | null {
  if (/\bCorrugate\b/i.test(fullText)) return 'corrugate';
  if (/\bTrapezoid(?:al)?\b/i.test(fullText)) return 'trapezoidal';
  if (/\bStanding\s*Seam\b/i.test(fullText)) return 'standing_seam';
  return null;
}

function extractVentedRidge(fullText: string): TriageVentedRidge | null {
  const ventedMatch = fullText.match(/Vented\s*ridge\s*[:=]?\s*(none|RV10P)\b/i);
  if (!ventedMatch) return null;
  return (ventedMatch[1].toUpperCase() === 'RV10P' ? 'RV10P' : 'none') as TriageVentedRidge;
}

async function readPageTextSummary(doc: any, pageNumber: number): Promise<ParsedPageText> {
  const page = await doc.getPage(pageNumber);
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
    const isRotated90 = Math.abs(t[1]) > Math.abs(t[0]) * 1.5;
    tokens.push({
      text: raw.trim(),
      xMm: t[4] * MM_PER_PT,
      yMm: t[5] * MM_PER_PT,
      widthMm: (item.width || 0) * MM_PER_PT,
      heightMm: Math.hypot(t[2], t[3]) * MM_PER_PT || (item.height || 0) * MM_PER_PT,
      isRotated90
    });
  }

  const lines = groupTextLines(tokens);
  const baselineLines = groupBaselineLines(tokens);
  const fullText = lines.map((l) => l.text).join('\n');
  const baselineFullText = baselineLines.map((l) => l.text).join('\n');
  const title = extractPageTitle(lines, baselineLines, pageWidthMm, pageHeightMm, pageNumber);
  const role = classifyRoleFromText(title);
  const isRoofPlan = role === 'roof';
  const isDetailsSheet = role === 'details';

  const scaleCandidates = extractScaleCandidates(baselineLines, lines, pageWidthMm, pageHeightMm);
  const windZone = extractWindZone(baselineFullText) ?? extractWindZone(fullText);
  const explicitPitchDeg = extractPitchDeg(lines, baselineLines, role);
  const unitaryPitchDeg =
    role === 'elevation' ? extractElevationUnitaryPitchDeg(lines, baselineLines) : null;
  const eaveHeightM = extractEaveHeightM(lines, baselineLines);
  const profileFamily = extractProfileFamily(fullText);
  const ventedRidge = extractVentedRidge(fullText);
  const areas = extractAreaMetrics(lines, baselineLines, pageNumber);
  const heights = extractHeightMetrics(lines, baselineLines, pageNumber);
  const flashingHints = extractFlashingHintsFromLines(lines, ventedRidge);

  return {
    pageNumber,
    page,
    pageWidthMm,
    pageHeightMm,
    tokens,
    lines,
    baselineLines,
    fullText,
    baselineFullText,
    title,
    role,
    isRoofPlan,
    isDetailsSheet,
    scaleCandidates,
    windZone,
    explicitPitchDeg,
    unitaryPitchDeg,
    eaveHeightM,
    profileFamily,
    ventedRidge,
    areas,
    heights,
    flashingHints
  };
}

function chooseRecommendedPage(summaries: ParsedPageText[]): ParsedPageText {
  const roofPages = summaries.filter((p) => p.role === 'roof');
  if (roofPages.length > 0) {
    return roofPages.find((p) => p.scaleCandidates.length > 0) ?? roofPages[0];
  }

  const floorPages = summaries.filter((p) => p.role === 'floor');
  if (floorPages.length > 0) {
    return floorPages.find((p) => p.scaleCandidates.length > 0) ?? floorPages[0];
  }

  const scaledOtherPlan = summaries.find(
    (p) => p.role === 'other' && p.scaleCandidates.length > 0
  );
  if (scaledOtherPlan) return scaledOtherPlan;

  return (
    summaries.find((p) => p.role === 'elevation') ??
    summaries.find((p) => p.role !== 'site' && p.role !== 'details') ??
    summaries[0]
  );
}

/**
 * Pure vector PDF triage reader.
 * Scans every page first for roles, scale candidates, pitch, wind, areas, heights, and flashing details,
 * chooses the recommended geometry page (roof -> floor -> best non-site candidate),
 * matches closed external loops against overall dimension chains (0.25 m tol + axis swap + area/aspect fallback),
 * and never calls a vision model or ApexMap geometry builders.
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
  const pageCount = Math.max(1, doc.numPages);

  // 1. Scan all pages first for roles & set-wide metrics
  const pageSummaries: ParsedPageText[] = [];
  for (let p = 1; p <= pageCount; p++) {
    pageSummaries.push(await readPageTextSummary(doc, p));
  }

  const recommendedSummary = chooseRecommendedPage(pageSummaries);
  const recommendedPage = recommendedSummary.pageNumber;

  const requestedPage =
    options?.pageNumber !== undefined
      ? Math.max(1, Math.min(pageCount, Math.round(options.pageNumber)))
      : null;

  const activeSummary =
    (requestedPage ? pageSummaries.find((p) => p.pageNumber === requestedPage) : null) ??
    recommendedSummary;

  const { page, pageWidthMm, pageHeightMm, tokens, lines, fullText } = activeSummary;
  const selectedPage = activeSummary.pageNumber;
  const pages: EnvelopeIntentPageInfo[] = pageSummaries.map((p) => ({
    page: p.pageNumber,
    title: p.title,
    role: p.role,
    isRoofPlan: p.isRoofPlan,
    isDetailsSheet: p.isDetailsSheet
  }));

  // Build evidence from active page lines plus key cross-page metric lines
  const evidence: Array<{ page: number; text: string }> = lines.map((l) => ({
    page: selectedPage,
    text: l.text
  }));
  const seenEvidence = new Set(evidence.map((e) => `${e.page}|${e.text}`));
  for (const summary of pageSummaries) {
    if (summary.pageNumber === selectedPage) continue;
    for (const l of summary.lines) {
      if (
        /\b(?:Wind\s*zone|UNITARY\s+PLAN|HIRB|pitch|eave|fascia|F\.?F\.?L\.?|ridge|Area|FD-\d+)\b/i.test(
          l.text
        )
      ) {
        const key = `${summary.pageNumber}|${l.text}`;
        if (!seenEvidence.has(key)) {
          seenEvidence.add(key);
          evidence.push({ page: summary.pageNumber, text: l.text });
        }
      }
    }
  }

  const opList = await page.getOperatorList();
  const allSegments = extractVectorSegments(opList);
  const allRects = findClosedRectangles(allSegments);

  // Synthesize set-level metadata (preferring active page, falling back across the set)
  const fixtureMatch = fullText.match(/Project:\s*ApexMap Fixture House\s+(R\d+)/i);
  const fixtureId = options?.fixtureId ?? (fixtureMatch ? fixtureMatch[1].toUpperCase() : undefined);

  const scaleCandidates = activeSummary.scaleCandidates;
  const manualDenom =
    options?.manualScaleDenom !== undefined &&
    Number.isFinite(options.manualScaleDenom) &&
    options.manualScaleDenom > 0
      ? options.manualScaleDenom
      : null;

  const northMatch = fullText.match(/\bNorth\s*[:=]?\s*up\b/i);
  const north: 'up' | null = northMatch ? 'up' : null;

  const profileFamily =
    activeSummary.profileFamily ??
    pageSummaries.find((s) => s.profileFamily !== null)?.profileFamily ??
    null;

  const windZone =
    activeSummary.windZone ?? pageSummaries.find((s) => s.windZone !== null)?.windZone ?? null;

  let pitchDeg: number | null = activeSummary.explicitPitchDeg;
  if (pitchDeg === null) {
    const orderedSummaries = [
      ...pageSummaries.filter((s) => s.role === 'roof'),
      ...pageSummaries.filter((s) => s.role === 'elevation'),
      ...pageSummaries.filter((s) => s.role === 'floor'),
      ...pageSummaries.filter((s) => s.role === 'other')
    ];
    for (const summary of orderedSummaries) {
      if (summary.explicitPitchDeg !== null) {
        pitchDeg = summary.explicitPitchDeg;
        break;
      }
    }
  }
  if (pitchDeg === null) {
    for (const summary of pageSummaries) {
      if (summary.role === 'elevation' && summary.unitaryPitchDeg !== null) {
        pitchDeg = summary.unitaryPitchDeg;
        break;
      }
    }
  }

  let eaveHeightM: number | null = activeSummary.eaveHeightM;
  if (eaveHeightM === null) {
    for (const summary of pageSummaries) {
      if (summary.role === 'site' || summary.role === 'details' || summary.role === 'other') continue;
      if (summary.eaveHeightM !== null) {
        eaveHeightM = summary.eaveHeightM;
        break;
      }
    }
  }

  const ventedRidge =
    activeSummary.ventedRidge ??
    pageSummaries.find((s) => s.ventedRidge !== null)?.ventedRidge ??
    null;

  // Aggregate flashing hints (active page first, then unique FD-xx codes from other pages)
  const flashingHints: EnvelopeIntentFlashingHint[] = [...activeSummary.flashingHints];
  const seenFd = new Set(flashingHints.map((h) => h.detail));
  for (const summary of pageSummaries) {
    if (summary.pageNumber === selectedPage) continue;
    for (const hint of summary.flashingHints) {
      if (!seenFd.has(hint.detail)) {
        seenFd.add(hint.detail);
        flashingHints.push(hint);
      }
    }
  }

  // Aggregate area & height metrics (active page first, then rest of set)
  const areas: EnvelopeIntentAreaMetric[] = [
    ...activeSummary.areas,
    ...pageSummaries.filter((s) => s.pageNumber !== selectedPage).flatMap((s) => s.areas)
  ];
  const heights: EnvelopeIntentHeightMetric[] = [
    ...activeSummary.heights,
    ...pageSummaries.filter((s) => s.pageNumber !== selectedPage).flatMap((s) => s.heights)
  ];

  const provisionalDenom = manualDenom ?? (scaleCandidates[0] ?? null);
  const provisionalScaleSource: 'printed' | 'user' | null = manualDenom
    ? 'user'
    : provisionalDenom
      ? 'printed'
      : null;

  const baseIntent: EnvelopeIntent = {
    ...(fixtureId ? { fixtureId } : {}),
    scope: 'roof_takeoff',
    scale: provisionalDenom ? `1:${provisionalDenom}` : null,
    scaleSource: provisionalScaleSource,
    selectedPage,
    recommendedPage,
    pageCount,
    pages,
    units: 'm',
    north,
    profileFamily,
    windZone,
    ventedRidge,
    eaveHeightM,
    pitchDeg,
    ...(areas.length > 0 ? { areas } : {}),
    ...(heights.length > 0 ? { heights } : {}),
    bodies: [],
    flashingHints,
    openings: [],
    evidence,
    blockers: []
  };

  if (!provisionalDenom) {
    return {
      ...baseIntent,
      confidence: 0,
      blockers: ['missing scale']
    };
  }

  // Never take an outline from site, details, or other non-plan sheets
  if (activeSummary.role === 'site') {
    return {
      ...baseIntent,
      confidence: 0,
      bodies: [],
      blockers: ['site plan has no roof outline — switch to the floor or roof plan sheet']
    };
  }
  if (activeSummary.role === 'details' || activeSummary.role === 'other') {
    return {
      ...baseIntent,
      confidence: 0,
      bodies: [],
      blockers: [
        'details or non-plan sheet has no roof outline — switch to the floor or roof plan sheet'
      ]
    };
  }

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

  const externalLoops = extractClosedExternalLoops(drawingSegments, pageWidthMm, pageHeightMm);
  const largestLoopBounds = externalLoops[0] ? getLoopBounds(externalLoops[0]) : null;

  const dimTokens = extractDimensionTokens(
    tokens,
    lines,
    titleBlockBox,
    detailBox,
    scaleBarBox
  );
  const { overallWidthM, overallHeightM } = computeOverallDimensionChains(
    dimTokens,
    drawingSegments,
    largestLoopBounds
  );

  // Building area metrics on active page (excluding site area) for fallback & confidence checks
  const buildingAreasOnPage = activeSummary.areas.filter((a) => !/\bsite\b/i.test(a.label));
  const buildingAreasSet = areas.filter((a) => !/\bsite\b/i.test(a.label));

  type LoopMatchQuality = 'tight' | 'relaxed' | 'swapped' | 'area_aspect' | 'unconstrained';
  interface LoopMatchResult {
    loop: TriagePoint2D[];
    quality: LoopMatchQuality;
    dimDeltaM: number | null;
  }

  const candidateDenomsToTry = manualDenom ? [manualDenom] : scaleCandidates;
  let chosenDenom = provisionalDenom;
  let chosenLoop: TriagePoint2D[] | null = null;
  let chosenDimDeltaM: number | null = null;

  const findMatchingLoopForDenom = (denom: number): LoopMatchResult | null => {
    if (externalLoops.length === 0) return null;
    const mmPerMetre = 1000 / denom;
    const measure = (loop: TriagePoint2D[]) => {
      const b = getLoopBounds(loop);
      const wM = (b.maxX - b.minX) / mmPerMetre;
      const hM = (b.maxY - b.minY) / mmPerMetre;
      const areaM2 = Math.abs(polygonSignedArea(loop)) / (mmPerMetre * mmPerMetre);
      return { wM, hM, areaM2, vertexCount: loop.length };
    };

    const areaMatches = (areaM2: number, a: EnvelopeIntentAreaMetric, tolRatio = 0.12) => {
      const flatDiff = Math.abs(areaM2 - a.valueM2) / a.valueM2;
      if (flatDiff <= tolRatio) return true;
      if (pitchDeg !== null && /\broof\b/i.test(a.label)) {
        const slopedM2 = areaM2 / Math.max(0.25, Math.cos((pitchDeg * Math.PI) / 180));
        if (Math.abs(slopedM2 - a.valueM2) / a.valueM2 <= tolRatio) return true;
      }
      return false;
    };

    const pickPreferred = (
      candidates: Array<{ loop: TriagePoint2D[]; err: number; areaM2: number }>
    ): { loop: TriagePoint2D[]; err: number } | null => {
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => {
        const errDiff = Math.round((a.err - b.err) * 50) / 50; // bucket within 0.02 m
        if (errDiff !== 0) return errDiff;
        if (a.loop.length !== b.loop.length) return a.loop.length - b.loop.length;
        return b.areaM2 - a.areaM2;
      });
      return { loop: candidates[0].loop, err: candidates[0].err };
    };

    const nonInternalLoops = externalLoops.filter((loop) => {
      if (overallWidthM !== null && overallHeightM !== null) {
        const { areaM2 } = measure(loop);
        return areaM2 >= overallWidthM * overallHeightM * 0.25;
      }
      return true;
    });

    if (overallWidthM !== null && overallHeightM !== null) {
      const collect = (
        predicate: (m: ReturnType<typeof measure>) => number | null
      ) => {
        const out: Array<{ loop: TriagePoint2D[]; err: number; areaM2: number }> = [];
        for (const loop of nonInternalLoops) {
          const m = measure(loop);
          const err = predicate(m);
          if (err !== null) out.push({ loop, err, areaM2: m.areaM2 });
        }
        return pickPreferred(out);
      };

      const tight = collect((m) =>
        Math.abs(m.wM - overallWidthM) <= 0.05 && Math.abs(m.hM - overallHeightM) <= 0.05
          ? Math.max(Math.abs(m.wM - overallWidthM), Math.abs(m.hM - overallHeightM))
          : null
      );
      if (tight) return { loop: tight.loop, quality: 'tight', dimDeltaM: tight.err };

      const relaxed = collect((m) =>
        Math.abs(m.wM - overallWidthM) <= 0.25 && Math.abs(m.hM - overallHeightM) <= 0.25
          ? Math.max(Math.abs(m.wM - overallWidthM), Math.abs(m.hM - overallHeightM))
          : null
      );
      if (relaxed) return { loop: relaxed.loop, quality: 'relaxed', dimDeltaM: relaxed.err };

      const swapped = collect((m) =>
        Math.abs(m.wM - overallHeightM) <= 0.25 && Math.abs(m.hM - overallWidthM) <= 0.25
          ? Math.max(Math.abs(m.wM - overallHeightM), Math.abs(m.hM - overallWidthM))
          : null
      );
      if (swapped) return { loop: swapped.loop, quality: 'swapped', dimDeltaM: swapped.err };

      if (buildingAreasOnPage.length > 0) {
        const targetAspect =
          Math.max(overallWidthM, overallHeightM) /
          Math.max(0.1, Math.min(overallWidthM, overallHeightM));
        const areaAspect = collect((m) => {
          const loopAspect = Math.max(m.wM, m.hM) / Math.max(0.1, Math.min(m.wM, m.hM));
          const aspectDiff = Math.abs(loopAspect - targetAspect) / targetAspect;
          const areaOk = buildingAreasOnPage.some((a) => areaMatches(m.areaM2, a, 0.12));
          return aspectDiff <= 0.2 && areaOk ? aspectDiff : null;
        });
        if (areaAspect) return { loop: areaAspect.loop, quality: 'area_aspect', dimDeltaM: null };
      }
      return null;
    }

    if (overallWidthM !== null) {
      const collect = (predicate: (m: ReturnType<typeof measure>) => number | null) => {
        const out: Array<{ loop: TriagePoint2D[]; err: number; areaM2: number }> = [];
        for (const loop of nonInternalLoops) {
          const m = measure(loop);
          const err = predicate(m);
          if (err !== null) out.push({ loop, err, areaM2: m.areaM2 });
        }
        return pickPreferred(out);
      };
      const tight = collect((m) => (Math.abs(m.wM - overallWidthM) <= 0.05 ? Math.abs(m.wM - overallWidthM) : null));
      if (tight) return { loop: tight.loop, quality: 'tight', dimDeltaM: tight.err };
      const relaxed = collect((m) => (Math.abs(m.wM - overallWidthM) <= 0.25 ? Math.abs(m.wM - overallWidthM) : null));
      if (relaxed) return { loop: relaxed.loop, quality: 'relaxed', dimDeltaM: relaxed.err };
      const swapped = collect((m) => (Math.abs(m.hM - overallWidthM) <= 0.25 ? Math.abs(m.hM - overallWidthM) : null));
      if (swapped) return { loop: swapped.loop, quality: 'swapped', dimDeltaM: swapped.err };
      if (buildingAreasOnPage.length > 0) {
        const areaMatch = collect((m) =>
          buildingAreasOnPage.some((a) => areaMatches(m.areaM2, a, 0.12)) ? 0.15 : null
        );
        if (areaMatch) return { loop: areaMatch.loop, quality: 'area_aspect', dimDeltaM: null };
      }
      return null;
    }

    if (overallHeightM !== null) {
      const collect = (predicate: (m: ReturnType<typeof measure>) => number | null) => {
        const out: Array<{ loop: TriagePoint2D[]; err: number; areaM2: number }> = [];
        for (const loop of nonInternalLoops) {
          const m = measure(loop);
          const err = predicate(m);
          if (err !== null) out.push({ loop, err, areaM2: m.areaM2 });
        }
        return pickPreferred(out);
      };
      const tight = collect((m) => (Math.abs(m.hM - overallHeightM) <= 0.05 ? Math.abs(m.hM - overallHeightM) : null));
      if (tight) return { loop: tight.loop, quality: 'tight', dimDeltaM: tight.err };
      const relaxed = collect((m) => (Math.abs(m.hM - overallHeightM) <= 0.25 ? Math.abs(m.hM - overallHeightM) : null));
      if (relaxed) return { loop: relaxed.loop, quality: 'relaxed', dimDeltaM: relaxed.err };
      const swapped = collect((m) => (Math.abs(m.wM - overallHeightM) <= 0.25 ? Math.abs(m.wM - overallHeightM) : null));
      if (swapped) return { loop: swapped.loop, quality: 'swapped', dimDeltaM: swapped.err };
      if (buildingAreasOnPage.length > 0) {
        const areaMatch = collect((m) =>
          buildingAreasOnPage.some((a) => areaMatches(m.areaM2, a, 0.12)) ? 0.15 : null
        );
        if (areaMatch) return { loop: areaMatch.loop, quality: 'area_aspect', dimDeltaM: null };
      }
      return null;
    }

    if (buildingAreasOnPage.length > 0) {
      const areaCandidates = nonInternalLoops
        .filter((loop) =>
          buildingAreasOnPage.some((a) => areaMatches(measure(loop).areaM2, a, 0.2))
        )
        .map((loop) => ({ loop, err: 0, areaM2: measure(loop).areaM2 }));
      const picked = pickPreferred(areaCandidates);
      if (picked) return { loop: picked.loop, quality: 'area_aspect', dimDeltaM: null };
    }

    const fallbackPool = nonInternalLoops.length > 0 ? nonInternalLoops : externalLoops;
    const preferredFallback = pickPreferred(
      fallbackPool.map((loop) => ({ loop, err: 0, areaM2: measure(loop).areaM2 }))
    );
    return preferredFallback
      ? { loop: preferredFallback.loop, quality: 'unconstrained', dimDeltaM: null }
      : null;
  };

  for (const denom of candidateDenomsToTry) {
    const matched = findMatchingLoopForDenom(denom);
    if (matched) {
      chosenDenom = denom;
      chosenLoop = matched.loop;
      chosenDimDeltaM = matched.dimDeltaM;
      break;
    }
  }

  const finalScale = `1:${chosenDenom}`;
  const finalIntent: EnvelopeIntent = {
    ...baseIntent,
    scale: finalScale
  };

  if (!chosenLoop) {
    const blockers =
      overallWidthM !== null || overallHeightM !== null
        ? ['no outline matched the overall dimensions', 'dimension mismatch']
        : ['no outline matched the overall dimensions'];
    return {
      ...finalIntent,
      confidence: 0,
      bodies: [],
      blockers
    };
  }

  const mmPerMetre = 1000 / chosenDenom;
  const loopBox = getLoopBounds(chosenLoop);
  const polyAreaM2 = Math.abs(polygonSignedArea(chosenLoop)) / (mmPerMetre * mmPerMetre);

  // Confidence check: compare extracted polygon area against printed area labels (warn if >15% off; never block)
  const warnings: string[] = [];
  const refAreaMetric = buildingAreasOnPage[0] ?? buildingAreasSet[0] ?? null;
  if (refAreaMetric && polyAreaM2 > 0) {
    const flatDiff = Math.abs(polyAreaM2 - refAreaMetric.valueM2) / refAreaMetric.valueM2;
    let bestDiff = flatDiff;
    if (pitchDeg !== null && /\broof\b/i.test(refAreaMetric.label)) {
      const slopedM2 = polyAreaM2 / Math.max(0.25, Math.cos((pitchDeg * Math.PI) / 180));
      const slopedDiff = Math.abs(slopedM2 - refAreaMetric.valueM2) / refAreaMetric.valueM2;
      bestDiff = Math.min(flatDiff, slopedDiff);
    }
    if (bestDiff > 0.15) {
      warnings.push(
        `Printed ${refAreaMetric.label} (${refAreaMetric.valueM2.toFixed(1)} m²) differs by ${Math.round(
          bestDiff * 100
        )}% from extracted outline (${polyAreaM2.toFixed(1)} m²).`
      );
    }
  }

  // Deterministic confidence (0–1):
  // Start 0.5 + 0.15 (roof) or 0.1 (floor w/ area) + 0.15 (dim match <= 0.1m) + 0.1 (pitch) + 0.05 (wind) - 0.2 (>15% area mismatch)
  let confidence = 0.5;
  if (activeSummary.role === 'roof') confidence += 0.15;
  else if (activeSummary.role === 'floor' && buildingAreasSet.length > 0) confidence += 0.1;
  if (chosenDimDeltaM !== null && chosenDimDeltaM <= 0.1) confidence += 0.15;
  if (pitchDeg !== null) confidence += 0.1;
  if (windZone !== null) confidence += 0.05;
  if (warnings.length > 0) confidence -= 0.2;
  confidence = Math.round(Math.max(0.1, Math.min(0.99, confidence)) * 100) / 100;

  // Translate origin to bounding-box lower-left (0, 0) in metres
  const outline: TriagePoint2D[] = chosenLoop.map((pt) => ({
    x: roundM((pt.x - loopBox.minX) / mmPerMetre),
    y: roundM((pt.y - loopBox.minY) / mmPerMetre)
  }));

  const edgeLabelTokens = tokens.filter((tok) =>
    /^(EAVE|GABLE|WALL|APRON)$/i.test(tok.text.trim())
  );

  const classifyEdgeType = (edgeIdx: number): { type: TriageEdgeType; eaveHeightM?: number } => {
    const a = chosenLoop![edgeIdx];
    const b = chosenLoop![(edgeIdx + 1) % chosenLoop!.length];
    let bestTok: TextToken | null = null;
    let bestDist = 25; // max 25 mm from edge
    for (const tok of edgeLabelTokens) {
      const cx = tok.xMm + tok.widthMm / 2;
      const cy = tok.yMm + tok.heightMm / 2;
      const d = distToSegmentMm({ x: cx, y: cy }, a, b);
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

  const edges = chosenLoop.map((_, idx) => classifyEdgeType(idx));

  // Detect interior structural ridge segments strictly inside the chosen closed loop
  const interiorSegs = drawingSegments.filter((seg) => {
    const mx = (seg.x1 + seg.x2) / 2;
    const my = (seg.y1 + seg.y2) / 2;
    if (!isPointInPolygonMm({ x: mx, y: my }, chosenLoop!)) return false;

    for (let i = 0; i < chosenLoop!.length; i++) {
      const a = chosenLoop![i];
      const b = chosenLoop![(i + 1) % chosenLoop!.length];
      if (
        distToSegmentMm({ x: seg.x1, y: seg.y1 }, a, b) <= 0.65 &&
        distToSegmentMm({ x: seg.x2, y: seg.y2 }, a, b) <= 0.65
      ) {
        return false;
      }
    }
    return true;
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

  // Skeleton gate (CRITICAL):
  // - Roof sheets run length-based ridge heuristics (>=50% bbox span OR adjacent RIDGE token)
  // - Floor proxy sheets NEVER convert interior partition walls into ridges; only explicit RIDGE-labeled spans allowed
  // - All other sheet roles emit empty skeleton
  const allowLengthRidgeHeuristic = activeSummary.role === 'roof';
  const allowLabeledRidgeOnly = activeSummary.role === 'floor' && ridgeTokens.length > 0;

  if (allowLengthRidgeHeuristic || allowLabeledRidgeOnly) {
    for (const hSpan of horizInterior) {
      const spanLen = hSpan.max - hSpan.min;
      const rectW = loopBox.maxX - loopBox.minX;
      const nearRidgeLabel = ridgeTokens.some(
        (rt) => Math.abs(rt.yMm - hSpan.coord) <= 12 && rt.xMm >= hSpan.min - 15 && rt.xMm <= hSpan.max + 15
      );
      if ((allowLengthRidgeHeuristic && spanLen >= rectW * 0.5) || nearRidgeLabel) {
        skeleton.push({
          type: 'ridge',
          from: {
            x: roundM((hSpan.min - loopBox.minX) / mmPerMetre),
            y: roundM((hSpan.coord - loopBox.minY) / mmPerMetre)
          },
          to: {
            x: roundM((hSpan.max - loopBox.minX) / mmPerMetre),
            y: roundM((hSpan.coord - loopBox.minY) / mmPerMetre)
          }
        });
      }
    }

    for (const vSpan of vertInterior) {
      const spanLen = vSpan.max - vSpan.min;
      const rectH = loopBox.maxY - loopBox.minY;
      const nearRidgeLabel = ridgeTokens.some(
        (rt) => Math.abs(rt.xMm - vSpan.coord) <= 12 && rt.yMm >= vSpan.min - 15 && rt.yMm <= vSpan.max + 15
      );
      if ((allowLengthRidgeHeuristic && spanLen >= rectH * 0.5) || nearRidgeLabel) {
        skeleton.push({
          type: 'ridge',
          from: {
            x: roundM((vSpan.coord - loopBox.minX) / mmPerMetre),
            y: roundM((vSpan.min - loopBox.minY) / mmPerMetre)
          },
          to: {
            x: roundM((vSpan.coord - loopBox.minX) / mmPerMetre),
            y: roundM((vSpan.max - loopBox.minY) / mmPerMetre)
          }
        });
      }
    }
  }

  return {
    ...finalIntent,
    confidence,
    ...(warnings.length > 0 ? { warnings } : {}),
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
