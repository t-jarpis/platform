import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Rng, type Seed } from "./rng.js";

/**
 * Binaire puzzel (ook bekend als Takuzu): vul een even, vierkant rooster met 0 en 1 zodat
 * - er nooit meer dan twee gelijke naast of onder elkaar staan,
 * - elke rij en kolom evenveel nullen als enen heeft,
 * - geen twee rijen gelijk zijn en geen twee kolommen gelijk zijn.
 */
export type BinarySize = 6 | 8 | 10 | 12 | 14;
export const BINARY_SIZES: readonly BinarySize[] = [6, 8, 10, 12, 14];

export type BinaryValue = 0 | 1;
/** `null` = leeg vakje. */
export type BinaryCell = BinaryValue | null;

/**
 * Technieken van de menselijke oplosser, van makkelijk naar moeilijk:
 * - `pair`: twee gelijke naast elkaar; de vakjes ervoor en erna krijgen het andere cijfer.
 * - `gap`: twee gelijke met één leeg vakje ertussen; dat vakje krijgt het andere cijfer.
 * - `count`: een rij of kolom heeft al de helft van één cijfer; de rest wordt het andere.
 * - `line`: van alle manieren om een rij of kolom af te maken (zonder drie op een rij en met gelijke
 *   aantallen) geven ze allemaal hetzelfde cijfer op een vakje.
 * - `unique`: zoals `line`, maar ook rekening houdend met de regel dat geen twee rijen (kolommen) gelijk zijn.
 */
export type BinaryTechnique = "pair" | "gap" | "count" | "line" | "unique";
export const BINARY_TECHNIQUES: readonly BinaryTechnique[] = ["pair", "gap", "count", "line", "unique"];
export const BINARY_BASIC: readonly BinaryTechnique[] = ["pair", "gap", "count"];
/** Punten per ingevuld vakje, naar de techniek die het vond. */
export const BINARY_TECHNIQUE_WEIGHTS: Readonly<Record<BinaryTechnique, number>> = { pair: 1, gap: 1, count: 2, line: 8, unique: 15 };

export interface BinaryGrade {
  solved: boolean;
  score: number;
  techniques: BinaryTechnique[];
  grid: BinaryCell[];
}

export interface BinaryPuzzle {
  size: BinarySize;
  /** Rij voor rij (index = y * size + x). */
  givens: BinaryCell[];
  solution: BinaryValue[];
  level: PuzzleLevel;
  seed: Seed;
  difficulty: { score: number; techniques: BinaryTechnique[] };
}

export interface BinaryOptions {
  seed: Seed;
  level: PuzzleLevel;
  size?: BinarySize;
}

interface BinarySettings {
  size: BinarySize;
  techniques: "basic" | "all";
  /** Stop met weghalen bij dit deel gegeven vakjes (0 = zo ver als het gaat). */
  givenShare: number;
}

export const BINARY_LEVELS: Readonly<Record<PuzzleLevel, BinarySettings>> = {
  starter: { size: 6, techniques: "basic", givenShare: 0.5 },
  "large-print": { size: 8, techniques: "basic", givenShare: 0.5 },
  advanced: { size: 8, techniques: "basic", givenShare: 0 },
  expert: { size: 10, techniques: "all", givenShare: 0 },
};

const EXPERT_ATTEMPTS = 8;

function assertSize(size: number): asserts size is BinarySize {
  if (!BINARY_SIZES.includes(size as BinarySize)) throw new RangeError("Formaat moet 6, 8, 10, 12 of 14 zijn");
}

/** Alle geldige lijnen van lengte n als bitmasker (bit i = vakje i is 1). */
const validCache = new Map<number, Uint32Array>();
function validLines(n: number): Uint32Array {
  let list = validCache.get(n);
  if (list) return list;
  const out: number[] = [];
  for (let m = 0; m < 1 << n; m++) {
    let ones = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) ones++;
    if (ones !== n / 2) continue;
    const full = (1 << n) - 1;
    const z = ~m & full;
    if ((m & (m >> 1) & (m >> 2)) || (z & (z >> 1) & (z >> 2))) continue;
    out.push(m);
  }
  list = Uint32Array.from(out);
  validCache.set(n, list);
  return list;
}

/** Voor een lijn met bekende vakjes `known` (waarvan `ones` een 1): wat geldt in alle geldige afmakingen? Gecachet. */
const summaryCache = new Map<number, Map<number, { all1: number; all0: number; any: boolean }>>();
function lineSummary(size: number, known: number, ones: number): { all1: number; all0: number; any: boolean } {
  let cache = summaryCache.get(size);
  if (!cache) { cache = new Map(); summaryCache.set(size, cache); }
  const key = known * (1 << size) + ones;
  let hit = cache.get(key);
  if (hit) return hit;
  const full = (1 << size) - 1;
  let all1 = full, all0 = full, any = false;
  for (const c of validLines(size)) {
    if ((c & known) !== ones) continue;
    any = true; all1 &= c; all0 &= ~c;
  }
  hit = { all1, all0, any };
  if (cache.size > 500_000) cache.clear();
  cache.set(key, hit);
  return hit;
}

interface Geometry {
  size: number;
  /** Per lijn (eerst rijen, dan kolommen) de vakje-indexen. */
  lines: number[][];
}
function geometry(size: number): Geometry {
  const lines: number[][] = [];
  for (let y = 0; y < size; y++) lines.push([...Array(size).keys()].map((x) => y * size + x));
  for (let x = 0; x < size; x++) lines.push([...Array(size).keys()].map((y) => y * size + x));
  return { size, lines };
}

/**
 * Lost op zoals een mens: telkens de makkelijkste techniek die iets oplevert (één ronde over alle
 * lijnen). Lukt het, dan heeft de puzzel precies één oplossing.
 */
export function gradeBinary(givens: readonly BinaryCell[], size: BinarySize, options: { techniques?: "basic" | "all" } = {}): BinaryGrade {
  assertSize(size);
  if (givens.length !== size * size) throw new RangeError("Verkeerd aantal vakjes");
  const { solved, score, techniques, grid } = grade(givens, size, options.techniques !== "basic");
  return { solved, score, techniques, grid };
}

function grade(givens: readonly BinaryCell[], size: number, advanced: boolean): BinaryGrade & { contradiction: boolean } {
  const { lines } = geometry(size);
  const grid: number[] = givens.map((v) => (v === null ? -1 : v));
  const used = new Set<BinaryTechnique>();
  let score = 0;
  let open = grid.filter((v) => v < 0).length;
  let contradiction = false;
  const half = size / 2;
  const valid = validLines(size);

  const set = (i: number, v: number, t: BinaryTechnique) => {
    if (grid[i] === -1) { grid[i] = v; open--; used.add(t); score += BINARY_TECHNIQUE_WEIGHTS[t]; }
    else if (grid[i] !== v) contradiction = true;
  };
  const pairs = (): boolean => {
    let found = false;
    for (const line of lines) {
      for (let k = 0; k + 1 < size; k++) {
        const a = grid[line[k] ?? 0] ?? -1, b = grid[line[k + 1] ?? 0] ?? -1;
        if (a < 0 || a !== b) continue;
        if (k > 0 && grid[line[k - 1] ?? 0] === -1) { set(line[k - 1] ?? 0, 1 - a, "pair"); found = true; }
        if (k + 2 < size && grid[line[k + 2] ?? 0] === -1) { set(line[k + 2] ?? 0, 1 - a, "pair"); found = true; }
      }
    }
    return found;
  };
  const gaps = (): boolean => {
    let found = false;
    for (const line of lines) {
      for (let k = 0; k + 2 < size; k++) {
        const a = grid[line[k] ?? 0] ?? -1, c = grid[line[k + 2] ?? 0] ?? -1;
        if (a >= 0 && a === c && grid[line[k + 1] ?? 0] === -1) { set(line[k + 1] ?? 0, 1 - a, "gap"); found = true; }
      }
    }
    return found;
  };
  const counts = (): boolean => {
    let found = false;
    for (const line of lines) {
      const ones = line.filter((i) => grid[i] === 1).length, zeros = line.filter((i) => grid[i] === 0).length;
      if (ones > half || zeros > half) { contradiction = true; return false; }
      if (ones + zeros === size) continue;
      if (ones === half) for (const i of line) if (grid[i] === -1) { set(i, 0, "count"); found = true; }
      if (zeros === half) for (const i of line) if (grid[i] === -1) { set(i, 1, "count"); found = true; }
    }
    return found;
  };
  const maskOf = (line: readonly number[]) => {
    let known = 0, ones = 0;
    line.forEach((i, k) => { if ((grid[i] ?? -1) >= 0) { known |= 1 << k; if (grid[i] === 1) ones |= 1 << k; } });
    return { known, ones };
  };
  /** `withUnique`: sluit lijnen uit die gelijk zijn aan een volle lijn in dezelfde richting. */
  const enumerate = (withUnique: boolean): boolean => {
    let found = false;
    const t: BinaryTechnique = withUnique ? "unique" : "line";
    lines.forEach((line, li) => {
      const { known, ones } = maskOf(line);
      const full = (1 << size) - 1;
      if (known === full) return;
      const forbidden: number[] = [];
      if (withUnique) {
        // Alleen volle lijnen die ook bij de bekende vakjes passen, maken verschil.
        const group = li < size ? lines.slice(0, size) : lines.slice(size);
        for (const other of group) { const m = maskOf(other); if (m.known === full && (m.ones & known) === ones) forbidden.push(m.ones); }
        if (forbidden.length === 0) return;
      }
      let all1: number, all0: number, any: boolean;
      if (forbidden.length === 0) ({ all1, all0, any } = lineSummary(size, known, ones));
      else {
        all1 = full; all0 = full; any = false;
        for (const c of valid) {
          if ((c & known) !== ones || forbidden.includes(c)) continue;
          any = true; all1 &= c; all0 &= ~c;
        }
      }
      if (!any) { contradiction = true; return; }
      line.forEach((i, k) => {
        if (grid[i] !== -1) return;
        if (all1 & (1 << k)) { set(i, 1, t); found = true; }
        else if (all0 & (1 << k)) { set(i, 0, t); found = true; }
      });
    });
    return found;
  };

  while (open > 0 && !contradiction) {
    if (pairs() || gaps() || counts()) continue;
    if (!advanced) break;
    if (enumerate(false)) continue;
    if (enumerate(true)) continue;
    break;
  }
  const full = open === 0 && !contradiction;
  if (full && !isValidBinary(grid as BinaryValue[], size)) contradiction = true;
  const solved = full && !contradiction;
  return { solved, contradiction, score, techniques: BINARY_TECHNIQUES.filter((t) => used.has(t)), grid: grid.map((v) => (v < 0 ? null : (v as BinaryValue))) };
}

/** True als het volle rooster aan alle drie de regels voldoet. */
export function isValidBinary(grid: readonly BinaryCell[], size: number): boolean {
  if (grid.length !== size * size || grid.some((v) => v === null)) return false;
  return binaryConflicts(grid, size).length === 0;
}

/**
 * Vakjes die een regel breken: drie gelijke op een rij, een lijn met te veel van één cijfer, of
 * een volle rij/kolom die gelijk is aan een andere. Lege vakjes botsen nooit.
 */
export function binaryConflicts(grid: readonly BinaryCell[], size: number): number[] {
  const { lines } = geometry(size);
  const bad = new Set<number>();
  lines.forEach((line) => {
    for (let k = 0; k + 2 < size; k++) {
      const a = grid[line[k] ?? 0] ?? null;
      if (a !== null && grid[line[k + 1] ?? 0] === a && grid[line[k + 2] ?? 0] === a) for (let d = 0; d < 3; d++) bad.add(line[k + d] ?? 0);
    }
    for (const v of [0, 1] as const) {
      const cells = line.filter((i) => grid[i] === v);
      if (cells.length > size / 2) cells.forEach((i) => bad.add(i));
    }
  });
  for (const group of [lines.slice(0, size), lines.slice(size)]) {
    const seen = new Map<string, number[]>();
    for (const line of group) {
      const values = line.map((i) => grid[i] ?? null);
      if (values.some((v) => v === null)) continue;
      const key = values.join("");
      const earlier = seen.get(key);
      if (earlier) { earlier.forEach((i) => bad.add(i)); line.forEach((i) => bad.add(i)); }
      else seen.set(key, line);
    }
  }
  return [...bad].sort((a, b) => a - b);
}

/** Telt oplossingen (rij voor rij met alle geldige lijnen), tot `limit`. */
export function countBinarySolutions(givens: readonly BinaryCell[], size: BinarySize, limit = 2): number {
  assertSize(size);
  if (givens.length !== size * size) throw new RangeError("Verkeerd aantal vakjes");
  let count = 0;
  searchBinary(size, givens, null, () => ++count >= limit);
  return count;
}

/** De enige (of eerste gevonden) oplossing, of `null`. */
export function solveBinary(givens: readonly BinaryCell[], size: BinarySize): BinaryValue[] | null {
  assertSize(size);
  let found: BinaryValue[] | null = null;
  searchBinary(size, givens, null, (grid) => { found = grid; return true; });
  return found;
}

/**
 * Backtracking met logica: eerst alles invullen wat volgt (alle technieken), dan op het eerste
 * lege vakje beide cijfers proberen. Met `rng` is de volgorde van de cijfers willekeurig (om een
 * willekeurig vol rooster te maken); `visit` geeft true om te stoppen.
 */
function searchBinary(size: number, givens: readonly BinaryCell[] | null, rng: Rng | null, visit: (grid: BinaryValue[]) => boolean): void {
  const step = (grid: readonly BinaryCell[]): boolean => {
    const g = grade(grid, size, true);
    if (g.contradiction) return false;
    if (g.solved) return visit(g.grid as BinaryValue[]);
    const i = g.grid.indexOf(null);
    if (i < 0) return false;
    const order: BinaryValue[] = rng && rng.int(2) === 1 ? [1, 0] : [0, 1];
    for (const v of order) {
      const next = g.grid.slice();
      next[i] = v;
      if (step(next)) return true;
    }
    return false;
  };
  step(givens ?? new Array<BinaryCell>(size * size).fill(null));
}

function randomSolution(size: number, rng: Rng): BinaryValue[] {
  let found: BinaryValue[] | null = null;
  searchBinary(size, null, rng, (grid) => { found = grid; return true; });
  if (!found) throw new Error("Kon geen binair rooster vullen");
  return found;
}

/**
 * Maakt een binaire puzzel met precies één oplossing. De menselijke oplosser bepaalt het niveau,
 * net als bij sudoku: vakjes gaan weg zolang hij de puzzel met de technieken van het niveau oplost.
 */
export function generateBinary(options: BinaryOptions): BinaryPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const s = BINARY_LEVELS[level];
  const size = options.size ?? s.size;
  assertSize(size);
  const rng = createRng(`binary|${size}|${level}|${String(seed)}`);
  const advanced = s.techniques === "all";
  const target = Math.round(size * size * s.givenShare);

  let best: { givens: BinaryCell[]; solution: BinaryValue[]; grade: BinaryGrade } | null = null;
  for (let attempt = 0; attempt < (advanced ? EXPERT_ATTEMPTS : 1); attempt++) {
    const solution = randomSolution(size, rng);
    const givens: BinaryCell[] = solution.slice();
    let left = givens.length;
    for (const i of rng.shuffle([...givens.keys()])) {
      if (left <= target) break;
      givens[i] = null;
      if (grade(givens, size, advanced).solved) left--;
      else givens[i] = solution[i] ?? null;
    }
    const g = grade(givens, size, advanced);
    const candidate = { givens, solution, grade: g };
    if (!advanced || g.techniques.some((t) => !BINARY_BASIC.includes(t))) { best = candidate; break; }
    if (!best || g.score > best.grade.score) best = candidate;
  }
  const { givens, solution, grade: g } = best as NonNullable<typeof best>;
  if (countBinarySolutions(givens, size, 2) !== 1) throw new Error("Gegenereerde binaire puzzel heeft geen unieke oplossing");
  return { size, givens, solution, level, seed, difficulty: { score: g.score, techniques: g.techniques } };
}

export interface BinaryEntryCheck {
  conflicts: number[];
  changedGivens: number[];
  complete: boolean;
  solved: boolean;
}

/** Controleert een (deels) ingevuld rooster van een speler tegen de regels en de gegeven vakjes. */
export function validateBinaryEntry(givens: readonly BinaryCell[], entry: readonly BinaryCell[], size: BinarySize): BinaryEntryCheck {
  assertSize(size);
  if (givens.length !== size * size || entry.length !== size * size) throw new RangeError("Verkeerd aantal vakjes");
  const conflicts = binaryConflicts(entry, size);
  const changedGivens = givens.flatMap((v, i) => (v !== null && entry[i] !== v ? [i] : []));
  const complete = entry.every((v) => v !== null);
  return { conflicts, changedGivens, complete, solved: complete && conflicts.length === 0 && changedGivens.length === 0 };
}
