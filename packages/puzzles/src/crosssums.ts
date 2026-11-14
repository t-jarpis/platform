import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Rng, type Seed } from "./rng.js";
import { must } from "./util.js";

/**
 * Kruissommen: vul de witte vakjes met 1..9. Elke reeks witte vakjes naast of onder elkaar telt op tot het getal in
 * het zwarte vakje ervoor, en binnen een reeks komt geen cijfer twee keer voor. Eigen generator en eigen naam.
 *
 * `cells[i]`: `null` = wit vakje; anders een zwart vakje met eventueel de som naar rechts (`right`) en naar
 * beneden (`down`). De eerste rij en kolom zijn altijd zwart.
 */
export interface CrossSumsBlock { right: number | null; down: number | null }

export interface CrossSumsPuzzle {
  width: number;
  height: number;
  cells: (CrossSumsBlock | null)[];
  /** Een enkel cijfer dat er al staat (alleen als het anders niet uniek wordt), anders `null`. */
  givens: (number | null)[];
  /** Cijfer per wit vakje, `null` op zwarte vakjes. */
  solution: (number | null)[];
  level: PuzzleLevel;
  seed: Seed;
}

interface CrossSumsSettings { size: number; blocks: number; maxDigit: number; maxShown: number; maxRun: number }

export const CROSS_SUMS_LEVELS: Readonly<Record<PuzzleLevel, CrossSumsSettings>> = {
  starter: { size: 5, blocks: 0.1, maxDigit: 6, maxShown: 3, maxRun: 4 },
  "large-print": { size: 5, blocks: 0.1, maxDigit: 9, maxShown: 3, maxRun: 4 },
  advanced: { size: 7, blocks: 0.15, maxDigit: 9, maxShown: 6, maxRun: 4 },
  expert: { size: 9, blocks: 0.15, maxDigit: 9, maxShown: 10, maxRun: 5 },
};

export interface CrossSumsOptions { seed: Seed; level: PuzzleLevel }

interface Run { cells: number[]; sum: number }

function runsOf(w: number, h: number, white: readonly boolean[]): { across: number[][]; down: number[][] } {
  const across: number[][] = [], down: number[][] = [];
  for (let r = 0; r < h; r++) {
    let cur: number[] = [];
    for (let c = 0; c <= w; c++) {
      const i = r * w + c;
      if (c < w && white[i]) cur.push(i);
      else { if (cur.length) across.push(cur); cur = []; }
    }
  }
  for (let c = 0; c < w; c++) {
    let cur: number[] = [];
    for (let r = 0; r <= h; r++) {
      const i = r * w + c;
      if (r < h && white[i]) cur.push(i);
      else { if (cur.length) down.push(cur); cur = []; }
    }
  }
  return { across, down };
}

function pattern(n: number, share: number, maxRun: number, rng: Rng): boolean[] | null {
  const white = Array.from({ length: n * n }, (_, i) => i >= n && i % n !== 0);
  const inner = Array.from({ length: n * n }, (_, i) => i).filter((i) => white[i]);
  for (const i of rng.shuffle(inner).slice(0, Math.round(inner.length * share))) white[i] = false;
  // Te lange reeksen knippen (korte reeksen maken de puzzel eenduidiger), reeksen van één vakje worden zwart.
  for (let changed = true, guard = 0; changed && guard < 50; guard++) {
    changed = false;
    const { across, down } = runsOf(n, n, white);
    for (const run of [...across, ...down]) {
      if (run.length > maxRun) { white[must(run[1 + rng.int(run.length - 2)])] = false; changed = true; break; }
      if (run.length === 1) { white[must(run[0])] = false; changed = true; break; }
    }
  }
  const cells = white.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (cells.length < (n - 1) * (n - 1) * 0.5) return null;
  // Alle witte vakjes moeten samen één geheel zijn.
  const seen = new Set([must(cells[0])]), stack = [must(cells[0])];
  while (stack.length) {
    const i = must(stack.pop());
    for (const j of [i - 1, i + 1, i - n, i + n]) if (j >= 0 && j < n * n && white[j] && !seen.has(j) && (Math.abs((j % n) - (i % n)) <= 1)) { seen.add(j); stack.push(j); }
  }
  if (seen.size !== cells.length) return null;
  const { across, down } = runsOf(n, n, white);
  if ([...across, ...down].some((r) => r.length > 9)) return null;
  return white;
}

function fill(n: number, white: readonly boolean[], maxDigit: number, rng: Rng): number[] | null {
  const { across, down } = runsOf(n, n, white);
  const runOf = new Map<number, number[][]>();
  for (const run of [...across, ...down]) for (const i of run) runOf.set(i, [...(runOf.get(i) ?? []), run]);
  const grid = new Array<number>(n * n).fill(0);
  const order = white.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const go = (k: number): boolean => {
    if (k === order.length) return true;
    const i = must(order[k]);
    for (const v of rng.shuffle(Array.from({ length: maxDigit }, (_, d) => d + 1))) {
      if (must(runOf.get(i)).some((run) => run.some((j) => grid[j] === v))) continue;
      grid[i] = v;
      if (go(k + 1)) return true;
      grid[i] = 0;
    }
    return false;
  };
  return go(0) ? grid : null;
}

/** Aantal oplossingen, tot `limit`; `null` als het te lang duurt. */
export function countCrossSumsSolutions(p: Pick<CrossSumsPuzzle, "width" | "height" | "cells" | "givens">, limit = 2, budget = 500_000): number | null {
  const r = solveCrossSums(p, limit, budget);
  return r && r.length;
}

/** Oplossingen (hoogstens `limit`), of `null` als het te lang duurt. */
function solveCrossSums(p: Pick<CrossSumsPuzzle, "width" | "height" | "cells" | "givens">, limit: number, budget: number): number[][] | null {
  const { width: w, height: h } = p;
  const white = p.cells.map((c) => c === null);
  const { across, down } = runsOf(w, h, white);
  const runs: Run[] = [];
  for (const cells of across) runs.push({ cells, sum: must(p.cells[must(cells[0]) - 1]).right ?? 0 });
  for (const cells of down) runs.push({ cells, sum: must(p.cells[must(cells[0]) - w]).down ?? 0 });
  const runsAt = new Map<number, Run[]>();
  for (const run of runs) for (const i of run.cells) runsAt.set(i, [...(runsAt.get(i) ?? []), run]);
  const grid = p.givens.map((g) => g ?? 0);
  // Mogelijke cijfers per reeks: alle cijfers die in een set van die lengte met die som voorkomen.
  const maskFor = new Map<string, number>();
  const combos = (len: number, sum: number) => {
    const key = `${len}|${sum}`;
    if (maskFor.has(key)) return must(maskFor.get(key));
    let mask = 0;
    const go = (start: number, left: number, s: number, used: number) => {
      if (left === 0) { if (s === sum) mask |= used; return; }
      for (let d = start; d <= 9; d++) if (s + d <= sum) go(d + 1, left - 1, s + d, used | (1 << d));
    };
    go(1, len, 0, 0);
    maskFor.set(key, mask);
    return mask;
  };
  const order = white.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  let steps = 0;
  const found: number[][] = [];
  const fits = (run: Run) => {
    let s = 0, used = 0, open = 0;
    for (const j of run.cells) { const v = must(grid[j]); if (!v) { open++; continue; } if (used & (1 << v)) return false; used |= 1 << v; s += v; }
    if (open === 0) return s === run.sum;
    // Nog genoeg ruimte: de kleinste en grootste aanvulling met ongebruikte cijfers.
    const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !(used & (1 << d)));
    const min = free.slice(0, open).reduce((a, b) => a + b, 0), max = free.slice(-open).reduce((a, b) => a + b, 0);
    return s + min <= run.sum && s + max >= run.sum;
  };
  const go = (k: number): boolean => {
    if (++steps > budget) return false;
    if (k === order.length) { found.push(grid.slice()); return found.length < limit; }
    const i = must(order[k]);
    if (grid[i]) return go(k + 1);
    const rs = must(runsAt.get(i));
    let mask = 0b1111111110;
    for (const r of rs) mask &= combos(r.cells.length, r.sum);
    for (let v = 1; v <= 9; v++) {
      if (!(mask & (1 << v))) continue;
      grid[i] = v;
      if (rs.every(fits) && !go(k + 1)) { grid[i] = 0; return false; }
      grid[i] = 0;
    }
    return true;
  };
  if (!runs.every(fits)) return [];
  const done = go(0);
  if (!done && steps > budget) return null;
  return found;
}

export function generateCrossSums(options: CrossSumsOptions): CrossSumsPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const set = CROSS_SUMS_LEVELS[level];
  const n = set.size;
  for (let attempt = 0; attempt < 300; attempt++) {
    const rng = createRng(`cross-sums|${level}|${seed}|${attempt}`);
    const white = pattern(n, set.blocks, set.maxRun, rng);
    if (!white) continue;
    const digits = fill(n, white, set.maxDigit, rng);
    if (!digits) continue;
    const { across, down } = runsOf(n, n, white);
    const cells: (CrossSumsBlock | null)[] = white.map((v) => (v ? null : { right: null, down: null }));
    for (const run of across) must(cells[must(run[0]) - 1]).right = run.reduce((s, i) => s + must(digits[i]), 0);
    for (const run of down) must(cells[must(run[0]) - n]).down = run.reduce((s, i) => s + must(digits[i]), 0);
    const givens: (number | null)[] = white.map(() => null);
    const puzzle = { width: n, height: n, cells, givens };
    // Niet uniek? Laat een cijfer zien waar een andere oplossing verschilt; hoogstens een paar, anders opnieuw.
    let shown = 0;
    let sols = solveCrossSums(puzzle, 2, 500_000);
    while (sols && sols.length > 1 && shown < set.maxShown) {
      const other = must(sols.find((g) => g.some((v, i) => white[i] && v !== digits[i])));
      const diff = rng.shuffle(white.map((v, i) => (v && other[i] !== digits[i] ? i : -1)).filter((i) => i >= 0));
      givens[must(diff[0])] = must(digits[must(diff[0])]);
      shown++;
      sols = solveCrossSums(puzzle, 2, 500_000);
    }
    const result = sols && sols.length;
    if (result !== 1) continue;
    // Getoonde cijfers die niet nodig blijken, weer weg.
    for (const i of givens.map((g, i) => (g ? i : -1)).filter((i) => i >= 0)) {
      givens[i] = null;
      if (countCrossSumsSolutions(puzzle) !== 1) givens[i] = must(digits[i]);
    }
    return { ...puzzle, solution: digits.map((d, i) => (white[i] ? d : null)), level, seed };
  }
  throw new Error("Geen kruissommen met één oplossing gevonden");
}
