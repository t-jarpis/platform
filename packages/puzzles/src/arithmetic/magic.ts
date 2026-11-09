import { assertLevel, type PuzzleLevel } from "../level.js";
import { createRng, type Rng, type Seed } from "../rng.js";
import { propagate, type Equation } from "./linear.js";

export type MagicSquareSize = 3 | 4;

/**
 * Magisch vierkant: elke rij, kolom en beide diagonalen hebben dezelfde som (`magicSum`, die wordt
 * meegegeven). De getallen zijn `start, start + step, …` (n² verschillende getallen).
 */
export interface MagicSquare {
  size: MagicSquareSize;
  magicSum: number;
  /** Kleinste getal en stapgrootte van de reeks die in het vierkant staat. */
  start: number;
  step: number;
  /** Rij voor rij; `null` = leeg. */
  givens: (number | null)[];
  solution: number[];
  level: PuzzleLevel;
  seed: Seed;
  difficulty: { steps: number; givens: number };
}

export interface MagicSquareOptions {
  seed: Seed;
  level: PuzzleLevel;
  size?: MagicSquareSize;
}

interface MagicSettings {
  size: MagicSquareSize;
  start: readonly [number, number];
  step: readonly [number, number];
  /** Gegeven vakjes boven wat minimaal nodig is. */
  extraGivens: number;
}

export const MAGIC_SQUARE_LEVELS: Readonly<Record<PuzzleLevel, MagicSettings>> = {
  starter: { size: 3, start: [1, 1], step: [1, 1], extraGivens: 1 },
  "large-print": { size: 3, start: [1, 1], step: [1, 1], extraGivens: 2 },
  advanced: { size: 3, start: [2, 20], step: [1, 3], extraGivens: 0 },
  expert: { size: 4, start: [1, 10], step: [1, 2], extraGivens: 0 },
};

/** Lo Shu. */
const BASE3 = [2, 7, 6, 9, 5, 1, 4, 3, 8];
/** Dürer (1514) en een pandiagonaal vierkant; het tweede blijft magisch bij cyclisch schuiven. */
const DURER = [16, 3, 2, 13, 5, 10, 11, 8, 9, 6, 7, 12, 4, 15, 14, 1];
const PANDIAGONAL = [7, 12, 1, 14, 2, 13, 8, 11, 16, 3, 10, 5, 9, 6, 15, 4];

function equations(size: number, sum: number): Equation[] {
  const n = size;
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push([...Array(n).keys()].map((c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push([...Array(n).keys()].map((r) => r * n + c));
  lines.push([...Array(n).keys()].map((k) => k * n + k));
  lines.push([...Array(n).keys()].map((k) => k * n + (n - 1 - k)));
  return lines.map((cells) => ({ cells, coeffs: cells.map(() => 1), total: sum }));
}

/** True als alle rijen, kolommen en diagonalen dezelfde som hebben. */
export function isMagicSquare(values: readonly number[], size: MagicSquareSize): boolean {
  if (values.length !== size * size) return false;
  const sum = values.slice(0, size).reduce((a, b) => a + b, 0);
  return equations(size, sum).every((eq) => eq.cells.reduce((a, c) => a + (values[c] ?? 0), 0) === sum);
}

/** Lost op door telkens een lijn met nog één leeg vakje af te maken. */
export function solveMagicSquare(givens: readonly (number | null)[], size: MagicSquareSize, magicSum: number): { solved: boolean; grid: (number | null)[]; steps: number } {
  if (givens.length !== size * size) throw new RangeError("Verkeerd aantal vakjes");
  const p = propagate(equations(size, magicSum), givens);
  return { solved: p.solved && !p.contradiction, grid: p.values, steps: p.steps };
}

/** Maakt een deels ingevuld magisch vierkant dat stap voor stap (en dus op één manier) op te lossen is. */
export function generateMagicSquare(options: MagicSquareOptions): MagicSquare {
  const { seed, level } = options;
  assertLevel(level);
  const s = MAGIC_SQUARE_LEVELS[level];
  const size = options.size ?? s.size;
  if (size !== 3 && size !== 4) throw new RangeError("Een magisch vierkant is 3×3 of 4×4");
  const rng = createRng(`magic|${level}|${size}|${String(seed)}`);
  const start = s.start[0] + rng.int(s.start[1] - s.start[0] + 1);
  const step = s.step[0] + rng.int(s.step[1] - s.step[0] + 1);
  const solution = randomSquare(size, rng).map((v) => start + step * (v - 1));
  if (!isMagicSquare(solution, size)) throw new Error("Interne fout: geen magisch vierkant");
  const magicSum = solution.slice(0, size).reduce((a, b) => a + b, 0);
  const eqs = equations(size, magicSum);

  // Weghalen zolang het stap voor stap op te lossen blijft, daarna eventueel wat hulp terug.
  const givens: (number | null)[] = solution.slice();
  for (const i of rng.shuffle([...givens.keys()])) {
    const v = givens[i] ?? null;
    givens[i] = null;
    if (!propagate(eqs, givens).solved) givens[i] = v;
  }
  const empty = rng.shuffle([...givens.keys()].filter((i) => givens[i] === null));
  for (const i of empty.slice(0, Math.min(s.extraGivens, empty.length - 1))) givens[i] = solution[i] ?? null;

  const check = propagate(eqs, givens);
  if (!check.solved) throw new Error("Gegenereerd magisch vierkant is niet op te lossen");
  return { size, magicSum, start, step, givens, solution, level, seed, difficulty: { steps: check.steps, givens: givens.filter((v) => v !== null).length } };
}

function randomSquare(size: MagicSquareSize, rng: Rng): number[] {
  const n = size;
  let sq: number[];
  if (n === 3) sq = BASE3.slice();
  else if (rng.int(2) === 0) sq = DURER.slice();
  else {
    const dr = rng.int(4), dc = rng.int(4);
    sq = PANDIAGONAL.map((_, i) => PANDIAGONAL[((Math.floor(i / 4) + dr) % 4) * 4 + (((i % 4) + dc) % 4)] ?? 0);
  }
  if (n === 4) {
    // Dezelfde wissel van rijen en kolommen; laat beide diagonalen heel.
    for (const perm of [[0, 2, 1, 3], [1, 0, 3, 2]]) {
      if (rng.int(2) === 0) continue;
      const from = sq;
      sq = from.map((_, i) => from[(perm[Math.floor(i / 4)] ?? 0) * 4 + (perm[i % 4] ?? 0)] ?? 0);
    }
  }
  // Draaien, spiegelen en eventueel complement (n² + 1 − x).
  const turns = rng.int(4);
  for (let t = 0; t < turns; t++) { const from = sq; sq = from.map((_, i) => from[(n - 1 - (i % n)) * n + Math.floor(i / n)] ?? 0); }
  if (rng.int(2) === 1) { const from = sq; sq = from.map((_, i) => from[Math.floor(i / n) * n + (n - 1 - (i % n))] ?? 0); }
  if (rng.int(2) === 1) sq = sq.map((v) => n * n + 1 - v);
  return sq;
}

export interface MagicSquareCheck {
  changedGivens: number[];
  /** Volle lijnen die niet op `magicSum` uitkomen: `row`/`column` met index, of `diagonal` 0 (↘) en 1 (↙). */
  wrongLines: { kind: "row" | "column" | "diagonal"; index: number }[];
  complete: boolean;
  solved: boolean;
}

/** Controleert een (deels) ingevuld vierkant van een speler tegen de som. */
export function checkMagicSquare(puzzle: Pick<MagicSquare, "size" | "magicSum" | "givens">, entry: readonly (number | null)[]): MagicSquareCheck {
  const { size, magicSum, givens } = puzzle;
  if (entry.length !== size * size) throw new RangeError("Verkeerd aantal vakjes");
  const changedGivens = givens.flatMap((v, i) => (v !== null && entry[i] !== v ? [i] : []));
  const wrongLines: MagicSquareCheck["wrongLines"] = [];
  equations(size, magicSum).forEach((eq, k) => {
    const values = eq.cells.map((c) => entry[c] ?? null);
    if (values.some((v) => v === null)) return;
    if ((values as number[]).reduce((a, b) => a + b, 0) === magicSum) return;
    wrongLines.push(k < size ? { kind: "row", index: k } : k < 2 * size ? { kind: "column", index: k - size } : { kind: "diagonal", index: k - 2 * size });
  });
  const complete = entry.every((v) => v !== null);
  return { changedGivens, wrongLines, complete, solved: complete && changedGivens.length === 0 && wrongLines.length === 0 };
}
