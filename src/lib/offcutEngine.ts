/**
 * offcutEngine.ts — roofing sheet cut-list + offcut reuse engine
 * ---------------------------------------------------------------
 * Pure TypeScript, no dependencies. Units: metres.
 *
 * MODEL
 *  - Each roof face is a CONVEX polygon in face-local coords:
 *      u = along the eave (horizontal), v = up the slope (TRUE slope length).
 *  - Sheets run down the slope (along v). Sheets are laid in columns of `coverWidth`.
 *  - Every needed piece (one per column) is a "strip piece": a region between a bottom
 *    curve and a top curve over a u-range, plus flags saying which side edges must be
 *    genuine factory rib edges (because another sheet laps onto them).
 *  - Pieces are converted into the PHYSICAL SHEET FRAME. If the profile is not symmetric,
 *    an RTL-laid face is a 180° rotation of an LTR-laid face. That is how laying
 *    direction decides whether an offcut is usable.
 *  - Offcuts live in an inventory. A needed piece may be cut from an offcut only if it
 *    fits by TRANSLATION ALONG THE SHEET (u is locked by the rib edge), and (optionally)
 *    after a 180° rotation when the profile is symmetric.
 *  - When no offcut fits, a new sheet is ordered. Its length is chosen by LOOKAHEAD:
 *    try several candidate lengths, simulate the rest of the job, keep the cheapest.
 */

export type Pt = { u: number; v: number };
export type Dir = 'LTR' | 'RTL';

export interface Config {
  coverWidth: number;        // effective cover width of one sheet (m)
  profileSymmetric: boolean; // true: offcut may be rotated 180° (corrugate-type). false: only same orientation
  eaveOverhang: number;      // sheet projection into gutter (m)
  lengthStep: number;        // order lengths rounded up to this (m)
  minOrderLength: number;
  maxOrderLength: number;
  minOffcutArea: number;     // offcuts smaller than this are scrap (m²)
  minOffcutDim: number;      // offcuts thinner than this are scrap (m)
  lookahead: boolean;        // choose order lengths by simulation
  capToLongestRun?: boolean;
}

export const DEFAULTS: Config = {
  coverWidth: 0.76,
  profileSymmetric: false,
  eaveOverhang: 0.05,
  lengthStep: 0.1,
  minOrderLength: 0.6,
  maxOrderLength: 12,
  minOffcutArea: 0.05,
  minOffcutDim: 0.15,
  lookahead: true,
  capToLongestRun: true,
};

export interface FaceInput {
  id: string;
  polygon: Pt[];          // convex, face-local, v up-slope, eave = lowest horizontal edge
  allowedDirs?: Dir[];    // e.g. wind rule. Default both.
}

// ───────────────────────── geometry helpers ─────────────────────────
const EPS = 1e-6;
const TOL = 1e-4;

interface Piece { u0: number; u1: number; bot: Pt[]; top: Pt[]; ribL: boolean; ribR: boolean }
type Xf = { su: number; sv: number; tu: number; tv: number }; // sheet = (su*u+tu, sv*v+tv)

function ev(line: Pt[], u: number): number {
  if (u <= line[0].u) return line[0].v;
  for (let i = 1; i < line.length; i++) {
    if (u <= line[i].u + EPS) {
      const a = line[i - 1], b = line[i], d = b.u - a.u;
      return d < EPS ? b.v : a.v + ((b.v - a.v) * (u - a.u)) / d;
    }
  }
  return line[line.length - 1].v;
}
function clipLine(line: Pt[], a: number, b: number): Pt[] {
  const out: Pt[] = [{ u: a, v: ev(line, a) }];
  for (const p of line) if (p.u > a + EPS && p.u < b - EPS) out.push(p);
  out.push({ u: b, v: ev(line, b) });
  return out;
}
const shiftLine = (l: Pt[], du: number, dv: number): Pt[] => l.map(p => ({ u: p.u + du, v: p.v + dv }));
const bps = (...lines: Pt[][]) => lines.flatMap(l => l.map(p => p.u));

const areaCache = new WeakMap<Piece, number>();
function area(p: Piece): number {
  const c = areaCache.get(p); if (c !== undefined) return c;
  const r = areaRaw(p); areaCache.set(p, r); return r;
}
function areaRaw(p: Piece): number {
  const us = [p.u0, p.u1, ...bps(p.bot, p.top).filter(u => u > p.u0 && u < p.u1)].sort((a, b) => a - b);
  let A = 0;
  for (let i = 1; i < us.length; i++) {
    const t0 = Math.max(0, ev(p.top, us[i - 1]) - ev(p.bot, us[i - 1]));
    const t1 = Math.max(0, ev(p.top, us[i]) - ev(p.bot, us[i]));
    A += ((t0 + t1) / 2) * (us[i] - us[i - 1]);
  }
  return A;
}
const maxThickness = (p: Piece) =>
  Math.max(...[p.u0, p.u1, ...bps(p.bot, p.top)].map(u => ev(p.top, u) - ev(p.bot, u)));
const extent = (p: Piece) =>
  Math.max(...p.top.map(q => q.v)) - Math.min(...p.bot.map(q => q.v));

function rot180(p: Piece, W: number): Piece {
  const f = (q: Pt): Pt => ({ u: W - q.u, v: -q.v });
  return { u0: W - p.u1, u1: W - p.u0, bot: p.top.map(f).reverse(), top: p.bot.map(f).reverse(), ribL: p.ribR, ribR: p.ribL };
}
const xfRot = (x: Xf, W: number): Xf => ({ su: -x.su, sv: -x.sv, tu: x.su * W + x.tu, tv: x.tv });
const xfApply = (x: Xf, u: number, v: number): Pt => ({ u: x.su * u + x.tu, v: x.sv * v + x.tv });

function polygonOf(p: Piece, du: number, dv: number, x: Xf): Pt[] {
  const bot = shiftLine(p.bot, du, dv), top = shiftLine(p.top, du, dv).reverse();
  return [...bot, ...top].map(q => xfApply(x, q.u, q.v));
}

// ───────────────────────── face → column pieces ─────────────────────────
function vRange(poly: Pt[], x: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (x < Math.min(p.u, q.u) - EPS || x > Math.max(p.u, q.u) + EPS) continue;
    if (Math.abs(q.u - p.u) < EPS) { lo = Math.min(lo, p.v, q.v); hi = Math.max(hi, p.v, q.v); }
    else { const v = p.v + ((x - p.u) / (q.u - p.u)) * (q.v - p.v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  return [lo, hi];
}

export interface Need {
  id: string; faceId: string; col: number; dir: Dir;
  a: number; b: number;       // column span in face u
  piece: Piece; ext: number; area: number;
}

function isConvex(poly: Pt[]): boolean {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
    const z = (b.u - a.u) * (c.v - b.v) - (b.v - a.v) * (c.u - b.u);
    if (Math.abs(z) < EPS) continue;
    if (s === 0) s = Math.sign(z); else if (Math.sign(z) !== s) return false;
  }
  return true;
}

export function buildNeeds(faces: FaceInput[], dirs: Record<string, Dir>, cfg: Config, warnings: string[]): Need[] {
  const W = cfg.coverWidth, needs: Need[] = [];
  for (const f of faces) {
    if (!isConvex(f.polygon)) warnings.push(`Face ${f.id} is not convex — split it at valleys/notches first.`);
    const us = f.polygon.map(p => p.u), vs = f.polygon.map(p => p.v);
    const minU = Math.min(...us), maxU = Math.max(...us), eaveV = Math.min(...vs);
    const dir = dirs[f.id];
    const cols: [number, number][] = [];
    if (dir === 'LTR') for (let a = minU; a < maxU - EPS; a += W) cols.push([a, Math.min(a + W, maxU)]);
    else for (let b = maxU; b > minU + EPS; b -= W) cols.push([Math.max(b - W, minU), b]);
    cols.forEach(([a, b], k) => {
      const cw = b - a;
      const xs = [a, b, ...f.polygon.map(p => p.u).filter(u => u > a + EPS && u < b - EPS)].sort((m, n) => m - n);
      const bot: Pt[] = [], top: Pt[] = [];
      for (const x of xs) {
        const [lo, hi] = vRange(f.polygon, x);
        bot.push({ u: x - a, v: lo - (Math.abs(lo - eaveV) < EPS ? cfg.eaveOverhang : 0) });
        top.push({ u: x - a, v: hi });
      }
      let piece: Piece = { u0: 0, u1: cw, bot, top, ribL: a > minU + EPS, ribR: b < maxU - EPS };
      if (dir === 'RTL') piece = rot180(piece, cw);       // physical orientation of an RTL face
      // anchor to the side that needs a rib so rib edges line up with the sheet's real edge
      if (!piece.ribL && piece.ribR) {
        const s = W - cw;
        piece = { ...piece, u0: piece.u0 + s, u1: piece.u1 + s, bot: shiftLine(piece.bot, s, 0), top: shiftLine(piece.top, s, 0) };
      }
      const e = extent(piece);
      if (e > cfg.maxOrderLength) warnings.push(`${f.id} col ${k}: needs ${e.toFixed(2)} m > max ${cfg.maxOrderLength} m — add an end-lap split.`);
      if (cw < 0.1) warnings.push(`${f.id} col ${k}: sliver ${Math.round(cw * 1000)} mm wide — consider shifting the start.`);
      needs.push({ id: `${f.id}#${k}`, faceId: f.id, col: k, dir, a, b, piece, ext: e, area: area(piece) });
    });
  }
  return needs;
}

// ───────────────────────── fitting & cutting ─────────────────────────
interface Fit { du: number; dv: number; lo: number; hi: number }

function fit(N: Piece, O: Piece): Fit | null {
  if (N.ribL && !O.ribL) return null;
  if (N.ribR && !O.ribR) return null;
  const dMin = O.u0 - N.u0, dMax = O.u1 - N.u1;
  if (dMax < dMin - TOL) return null;
  let du: number;
  if (N.ribL && N.ribR) { if (Math.abs(dMax - dMin) > TOL) return null; du = dMin; }
  else if (N.ribL) du = dMin;
  else if (N.ribR) du = dMax;
  else du = O.ribR && !O.ribL ? dMax : dMin;
  const a = N.u0 + du, b = N.u1 + du;
  const us = [a, b, ...bps(shiftLine(N.bot, du, 0), shiftLine(N.top, du, 0), O.bot, O.top).filter(u => u > a && u < b)];
  let lo = -Infinity, hi = Infinity;
  for (const u of us) {
    lo = Math.max(lo, ev(O.bot, u) - ev(N.bot, u - du));
    hi = Math.min(hi, ev(O.top, u) - ev(N.top, u - du));
  }
  if (lo > hi + TOL) return null;
  return { du, dv: lo, lo, hi };
}

function usable(p: Piece, cfg: Config): boolean {
  return p.u1 - p.u0 > EPS && maxThickness(p) >= cfg.minOffcutDim && area(p) >= cfg.minOffcutArea;
}

function cut(N: Piece, O: Piece, f: Fit, cfg: Config): Piece[] {
  const a = N.u0 + f.du, b = N.u1 + f.du, out: Piece[] = [];
  const nb = shiftLine(N.bot, f.du, f.dv), nt = shiftLine(N.top, f.du, f.dv);
  const touchL = Math.abs(a - O.u0) < TOL, touchR = Math.abs(b - O.u1) < TOL;
  if (a - O.u0 > TOL) out.push({ u0: O.u0, u1: a, bot: clipLine(O.bot, O.u0, a), top: clipLine(O.top, O.u0, a), ribL: O.ribL, ribR: false });
  if (O.u1 - b > TOL) out.push({ u0: b, u1: O.u1, bot: clipLine(O.bot, b, O.u1), top: clipLine(O.top, b, O.u1), ribL: false, ribR: O.ribR });
  out.push({ u0: a, u1: b, bot: nt, top: clipLine(O.top, a, b), ribL: O.ribL && touchL, ribR: O.ribR && touchR }); // above
  out.push({ u0: a, u1: b, bot: clipLine(O.bot, a, b), top: nb, ribL: O.ribL && touchL, ribR: O.ribR && touchR }); // below
  return out.filter(p => usable(p, cfg));
}

// ───────────────────────── solver ─────────────────────────
interface Item { piece: Piece; xf: Xf; sheetId: number }
export interface Placement { needId: string; faceId: string; col: number; sheetId: number; poly: Pt[]; fromOffcut: boolean; rotated: boolean }
export interface Sheet { id: number; length: number; width: number; placements: Placement[]; leftovers: Pt[][] }

const roundUp = (x: number, s: number) => Math.ceil(x / s - 1e-9) * s;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

interface Hit { idx: number; rot: boolean; O: Piece; xf: Xf; f: Fit; waste: number }

function findBest(N: Piece, inv: Item[], cfg: Config): Hit | null {
  let best: Hit | null = null;
  const aN = area(N);
  inv.forEach((it, idx) => {
    const tries: [boolean, Piece, Xf][] = [[false, it.piece, it.xf]];
    if (cfg.profileSymmetric) tries.push([true, rot180(it.piece, cfg.coverWidth), xfRot(it.xf, cfg.coverWidth)]);
    for (const [rot, O, xf] of tries) {
      const f = fit(N, O);
      if (!f) continue;
      const waste = area(O) - aN;
      if (!best || waste < best.waste - 1e-9) best = { idx, rot, O, xf, f, waste };
    }
  });
  return best;
}

interface Cand { S: number; pack: 'lo' | 'hi' }
const IDENT: Xf = { su: 1, sv: 1, tu: 0, tv: 0 };
const topV = (poly: Pt[]) => Math.max(...poly.map(p => p.v));

/** Shortest sheet that holds P (at the bottom) AND Q nested into what is left above P. */
function nestLength(P: Piece, Q: Piece, cfg: Config): number | null {
  const W = cfg.coverWidth, big = newSheet(cfg.maxOrderLength, W), f = fit(P, big);
  if (!f) return null;
  const rem = cut(P, big, { du: f.du, dv: f.lo, lo: f.lo, hi: f.hi }, cfg);
  let best = Infinity;
  for (const R of rem) for (const rot of cfg.profileSymmetric ? [false, true] : [false]) {
    const O = rot ? rot180(R, W) : R, xf = rot ? xfRot(IDENT, W) : IDENT, g = fit(Q, O);
    if (!g) continue;
    best = Math.min(best, topV(polygonOf(Q, g.du, rot ? g.hi : g.lo, xf)));
  }
  return isFinite(best) ? Math.max(best, topV(polygonOf(P, f.du, f.lo, IDENT))) : null;
}

function candidateLengths(order: Need[], i: number, cfg: Config, nest: boolean): Cand[] {
  const clamp = (e: number) => Math.min(cfg.maxOrderLength, Math.max(cfg.minOrderLength, roundUp(e, cfg.lengthStep)));
  const N = order[i];
  const smin = clamp(N.ext);
  const out: Cand[] = [{ S: smin, pack: 'lo' }]; // default FIRST (exact length)
  if (!nest) return out;
  const scored: { c: Cand; eff: number }[] = [];
  for (let j = i + 1; j < order.length; j++) {
    const M = order[j];
    const a = nestLength(N.piece, M.piece, cfg);   // N at bottom, M above it
    if (a !== null) { const S = clamp(a); if (S > smin + EPS) scored.push({ c: { S, pack: 'lo' }, eff: (N.area + M.area) / (S * cfg.coverWidth) }); }
    const b = nestLength(M.piece, N.piece, cfg);   // M at bottom, N above it
    if (b !== null) { const S = clamp(b); if (S >= smin - EPS) scored.push({ c: { S, pack: 'hi' }, eff: (N.area + M.area) / (S * cfg.coverWidth) }); }
  }
  scored.sort((x, y) => y.eff - x.eff);
  for (const { c } of scored) {
    if (out.length >= 5) break;
    if (!out.some(o => Math.abs(o.S - c.S) < EPS && o.pack === c.pack)) out.push(c);
  }
  return out;
}

function newSheet(S: number, W: number): Piece {
  return { u0: 0, u1: W, bot: [{ u: 0, v: 0 }, { u: W, v: 0 }], top: [{ u: 0, v: S }, { u: W, v: S }], ribL: true, ribR: true };
}

interface Run { cost: number; sheets: Sheet[]; inv: Item[] }

function runFrom(order: Need[], i0: number, inv0: Item[], cfg: Config, lookahead: boolean, record: boolean, sheets: Sheet[] = [], nextId = 1): Run {
  let inv = inv0, cost = 0, id = nextId;
  const W = cfg.coverWidth;
  for (let i = i0; i < order.length; i++) {
    const n = order[i], N = n.piece;
    const hit = findBest(N, inv, cfg);
    if (hit) {
      const rem = cut(N, hit.O, hit.f, cfg).map(p => ({ piece: p, xf: hit.xf, sheetId: inv[hit.idx].sheetId }));
      if (record) {
        const sh = sheets.find(s => s.id === inv[hit.idx].sheetId)!;
        sh.placements.push({ needId: n.id, faceId: n.faceId, col: n.col, sheetId: sh.id, poly: polygonOf(N, hit.f.du, hit.f.dv, hit.xf), fromOffcut: true, rotated: hit.rot });
      }
      inv = [...inv.slice(0, hit.idx), ...inv.slice(hit.idx + 1), ...rem];
      continue;
    }
    const cands = candidateLengths(order, i, cfg, lookahead);
    const place = (c: Cand) => {
      const O = newSheet(c.S, W), f = fit(N, O);
      if (!f) throw new Error(`Piece ${n.id} cannot fit a ${c.S} m sheet`);
      const fx: Fit = { ...f, dv: c.pack === 'hi' ? f.hi : f.lo };
      return { f: fx, O, rem: cut(N, O, fx, cfg) };
    };
    let pick = cands[0];
    if (lookahead && cands.length > 1) {
      let bestC = Infinity;
      for (const c of cands) {
        const p = place(c);
        const sim = runFrom(order, i + 1, [...inv, ...p.rem.map(r => ({ piece: r, xf: IDENT, sheetId: -1 }))], cfg, false, false);
        const total = c.S + sim.cost;
        if (total < bestC - 1e-9) { bestC = total; pick = c; }
      }
    }
    const p = place(pick), sid = id++;
    cost += pick.S;
    if (record) sheets.push({ id: sid, length: pick.S, width: W, placements: [{ needId: n.id, faceId: n.faceId, col: n.col, sheetId: sid, poly: polygonOf(N, p.f.du, p.f.dv, IDENT), fromOffcut: false, rotated: false }], leftovers: [] });
    inv = [...inv, ...p.rem.map(r => ({ piece: r, xf: IDENT, sheetId: sid }))];
  }
  if (record) for (const it of inv) { const sh = sheets.find(s => s.id === it.sheetId); if (sh) sh.leftovers.push(polygonOf(it.piece, 0, 0, it.xf)); }
  return { cost, sheets, inv };
}

// ───────────────────────── public API ─────────────────────────
export interface Plan {
  dirs: Record<string, Dir>;
  sheets: Sheet[];
  needs: Need[];
  orderedLength: number;      // total metres of sheet to order
  orderedArea: number;        // m² (cover width × length)
  placedArea: number;
  utilisation: number;        // placedArea / orderedArea
  naiveLength: number;        // same job with NO offcut reuse (each column its own sheet)
  savedLength: number;
  reusedPieces: number;
  warnings: string[];
}

function solveWith(faces: FaceInput[], dirs: Record<string, Dir>, cfg: Config, record: boolean): Plan {
  const warnings: string[] = [];
  const needs = buildNeeds(faces, dirs, cfg, warnings);
  const order = [...needs].sort((x, y) => y.ext - x.ext || y.area - x.area || (x.id < y.id ? -1 : 1));
  const sheets: Sheet[] = [];
  const longest = Math.max(...needs.map(n => n.ext));
  const eff: Config = cfg.capToLongestRun ? { ...cfg, maxOrderLength: Math.min(cfg.maxOrderLength, Math.max(cfg.minOrderLength, roundUp(longest, cfg.lengthStep))) } : cfg;
  const run = runFrom(order, 0, [], eff, cfg.lookahead, record, sheets);
  const step = (e: number) => Math.min(cfg.maxOrderLength, Math.max(cfg.minOrderLength, roundUp(e, cfg.lengthStep)));
  const naive = needs.reduce((s, n) => s + step(n.ext), 0);
  const placedArea = needs.reduce((s, n) => s + n.area, 0);
  const orderedArea = run.cost * cfg.coverWidth;
  return {
    dirs, sheets, needs, orderedLength: r3(run.cost), orderedArea: r3(orderedArea), placedArea: r3(placedArea),
    utilisation: r3(placedArea / orderedArea), naiveLength: r3(naive), savedLength: r3(naive - run.cost),
    reusedPieces: sheets.reduce((s, sh) => s + sh.placements.filter(p => p.fromOffcut).length, 0), warnings,
  };
}

/** Plan a whole roof. If `fixedDirs` omits a face, its laying direction is OPTIMISED (within allowedDirs). */
export function planRoof(faces: FaceInput[], partial: Partial<Config> = {}, fixedDirs: Record<string, Dir> = {}): Plan {
  const cfg = { ...DEFAULTS, ...partial };
  const free = faces.filter(f => !fixedDirs[f.id]);
  const options = (f: FaceInput) => f.allowedDirs ?? (['LTR', 'RTL'] as Dir[]);
  let combos: Record<string, Dir>[] = [{ ...fixedDirs }];
  for (const f of free) combos = combos.flatMap(c => options(f).map(d => ({ ...c, [f.id]: d })));
  if (combos.length > 64) { // too many faces: coordinate descent from all-LTR
    let cur: Record<string, Dir> = { ...fixedDirs }; free.forEach(f => (cur[f.id] = options(f)[0]));
    let best = solveWith(faces, cur, cfg, false), improved = true;
    while (improved) {
      improved = false;
      for (const f of free) for (const d of options(f)) {
        if (cur[f.id] === d) continue;
        const t = solveWith(faces, { ...cur, [f.id]: d }, cfg, false);
        if (t.orderedLength < best.orderedLength - 1e-9) { best = t; cur = { ...cur, [f.id]: d }; improved = true; }
      }
    }
    return solveWith(faces, cur, cfg, true);
  }
  let bestDirs = combos[0], bestScore = Infinity;
  for (const c of combos) {
    const p = solveWith(faces, c, cfg, false);
    const score = p.orderedLength * 1000 + p.needs.length; // length first, then tie-break
    if (score < bestScore - 1e-9) { bestScore = score; bestDirs = c; }
  }
  return solveWith(faces, bestDirs, cfg, true);
}

/** Helper: standard 4-hip roof (rectangular plan, equal pitch). slope = true ridge→gutter length. */
export function hipRoofFaces(lengthM: number, widthM: number, slope: number): FaceInput[] {
  const ridgeInset = widthM / 2, x0 = ridgeInset, x1 = lengthM - ridgeInset;
  const trunk = [{ u: 0, v: 0 }, { u: lengthM, v: 0 }, { u: x1, v: slope }, { u: x0, v: slope }];
  const end = [{ u: 0, v: 0 }, { u: widthM, v: 0 }, { u: widthM / 2, v: slope }];
  return [
    { id: 'Trunk-S', polygon: trunk }, { id: 'Trunk-N', polygon: trunk },
    { id: 'End-E', polygon: end }, { id: 'End-W', polygon: end },
  ];
}
