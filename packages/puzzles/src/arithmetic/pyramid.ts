import { assertLevel, type PuzzleLevel } from "../level.js";
import { createRng, type Rng, type Seed } from "../rng.js";
import { propagate, type Equation, type Propagation } from "./linear.js";

/**
 * Rekenpiramide: elk vakje is de som van de twee vakjes eronder. Rijen van boven (1 vakje) naar
 * onder (`rows` vakjes). Een deel van de onderste rij en een paar vakjes hoger zijn gegeven.
 */
export interface NumberPyramid {
  rows: number;
  /** Per rij, van boven naar onder; `null` = leeg. */
  givens: (number | null)[][];
  solution: number[][];
  level: PuzzleLevel;
  seed: Seed;
  difficulty: { steps: number; givens: number };
}

export interface NumberPyramidOptions {
  seed: Seed;
  level: PuzzleLevel;
  /** Aantal rijen (2 tot en met 8); standaard die van het niveau. */
  rows?: number;
}

interface PyramidSettings {
  rows: number;
  /** Bereik van de getallen in de onderste rij. */
  bottom: readonly [number, number];
  /** Gegeven vakjes boven het minimum (het minimum is `rows`). */
  extraGivens: number;
  /** Minimaal aantal lege vakjes in de onderste rij. */
  bottomMissing: number;
}

export const NUMBER_PYRAMID_LEVELS: Readonly<Record<PuzzleLevel, PyramidSettings>> = {
  starter: { rows: 3, bottom: [1, 10], extraGivens: 1, bottomMissing: 1 },
  "large-print": { rows: 4, bottom: [1, 6], extraGivens: 2, bottomMissing: 1 },
  advanced: { rows: 4, bottom: [1, 20], extraGivens: 0, bottomMissing: 1 },
  expert: { rows: 5, bottom: [1, 25], extraGivens: 0, bottomMissing: 2 },
};

const ATTEMPTS = 30;
const index = (r: number, i: number) => (r * (r + 1)) / 2 + i;

function equations(rows: number): Equation[] {
  const eqs: Equation[] = [];
  for (let r = 0; r < rows - 1; r++) for (let i = 0; i <= r; i++) eqs.push({ cells: [index(r, i), index(r + 1, i), index(r + 1, i + 1)], coeffs: [1, -1, -1], total: 0 });
  return eqs;
}

const flatten = (grid: readonly (readonly (number | null)[])[]) => grid.flat();
function unflatten<T>(flat: readonly T[], rows: number): T[][] {
  return Array.from({ length: rows }, (_, r) => flat.slice(index(r, 0), index(r, 0) + r + 1));
}

function assertShape(grid: readonly (readonly unknown[])[]): number {
  const rows = grid.length;
  if (rows < 2 || rows > 8 || grid.some((row, r) => row.length !== r + 1)) throw new RangeError("Een piramide heeft 2 tot 8 rijen; rij r (vanaf 0) heeft r + 1 vakjes");
  return rows;
}

/** Lost een piramide op door telkens een driehoekje met twee bekende vakjes af te maken. */
export function solveNumberPyramid(givens: readonly (readonly (number | null)[])[]): { solved: boolean; grid: (number | null)[][]; steps: number } {
  const rows = assertShape(givens);
  const p = propagate(equations(rows), flatten(givens));
  return { solved: p.solved, grid: unflatten(p.values, rows), steps: p.steps };
}

/** Maakt een rekenpiramide die met alleen optellen en aftrekken (stap voor stap) op te lossen is, en dus precies één oplossing heeft. */
export function generateNumberPyramid(options: NumberPyramidOptions): NumberPyramid {
  const { seed, level } = options;
  assertLevel(level);
  const s = NUMBER_PYRAMID_LEVELS[level];
  const rows = options.rows ?? s.rows;
  if (!Number.isInteger(rows) || rows < 2 || rows > 8) throw new RangeError("rows moet tussen 2 en 8 liggen");
  const rng = createRng(`pyramid|${level}|${rows}|${String(seed)}`);
  const eqs = equations(rows);
  const target = rows + s.extraGivens;
  const bottomMissing = Math.min(s.bottomMissing, rows - 1);

  let best: { givens: (number | null)[]; solution: number[]; score: number } | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const solution = buildSolution(rows, s.bottom, rng);
    const givens = reduce(solution, rows, eqs, target, rng);
    const missing = givens.slice(index(rows - 1, 0)).filter((v) => v === null).length;
    const count = givens.filter((v) => v !== null).length;
    const score = (missing >= bottomMissing ? 0 : 1000) + Math.abs(count - target);
    if (!best || score < best.score) best = { givens, solution, score };
    if (score === 0) break;
  }
  const { givens, solution } = best as { givens: (number | null)[]; solution: number[] };
  const check: Propagation = propagate(eqs, givens);
  if (!check.solved) throw new Error("Gegenereerde piramide is niet op te lossen");
  return {
    rows,
    givens: unflatten(givens, rows),
    solution: unflatten(solution, rows),
    level,
    seed,
    difficulty: { steps: check.steps, givens: givens.filter((v) => v !== null).length },
  };
}

function buildSolution(rows: number, [min, max]: readonly [number, number], rng: Rng): number[] {
  const values = new Array<number>(index(rows, 0)).fill(0);
  for (let i = 0; i < rows; i++) values[index(rows - 1, i)] = min + rng.int(max - min + 1);
  for (let r = rows - 2; r >= 0; r--) for (let i = 0; i <= r; i++) values[index(r, i)] = (values[index(r + 1, i)] ?? 0) + (values[index(r + 1, i + 1)] ?? 0);
  return values;
}

/** Haalt vakjes weg zolang de piramide op te lossen blijft, tot `target` gegeven vakjes. De onderste rij houdt er minstens één. */
function reduce(solution: readonly number[], rows: number, eqs: readonly Equation[], target: number, rng: Rng): (number | null)[] {
  const givens: (number | null)[] = solution.slice();
  const bottom = index(rows - 1, 0);
  let left = givens.length;
  for (const i of rng.shuffle([...givens.keys()])) {
    if (left <= target) break;
    if (i >= bottom && givens.slice(bottom).filter((v) => v !== null).length === 1) continue;
    const v = givens[i] ?? null;
    givens[i] = null;
    if (propagate(eqs, givens).solved) left--;
    else givens[i] = v;
  }
  return givens;
}

export interface NumberPyramidCheck {
  /** Vakjes [rij, positie] waar een gegeven getal is veranderd. */
  changedGivens: [number, number][];
  /** Driehoekjes [rij, positie] (bovenste vakje) die niet kloppen terwijl alle drie de vakjes zijn ingevuld. */
  wrongSums: [number, number][];
  complete: boolean;
  solved: boolean;
}

/** Controleert een (deels) ingevulde piramide van een speler. Alleen de rekenregel, geen oplossing nodig. */
export function checkNumberPyramid(givens: readonly (readonly (number | null)[])[], entry: readonly (readonly (number | null)[])[]): NumberPyramidCheck {
  const rows = assertShape(givens);
  if (assertShape(entry) !== rows) throw new RangeError("Ingevulde piramide heeft een ander formaat");
  const changedGivens: [number, number][] = [];
  const wrongSums: [number, number][] = [];
  givens.forEach((row, r) => row.forEach((v, i) => { if (v !== null && entry[r]?.[i] !== v) changedGivens.push([r, i]); }));
  for (let r = 0; r < rows - 1; r++) {
    for (let i = 0; i <= r; i++) {
      const top = entry[r]?.[i] ?? null, a = entry[r + 1]?.[i] ?? null, b = entry[r + 1]?.[i + 1] ?? null;
      if (top !== null && a !== null && b !== null && top !== a + b) wrongSums.push([r, i]);
    }
  }
  const complete = entry.every((row) => row.every((v) => v !== null));
  return { changedGivens, wrongSums, complete, solved: complete && changedGivens.length === 0 && wrongSums.length === 0 };
}
