import { assertLevel, type PuzzleLevel } from "../level.js";
import { createRng, type Rng, type Seed } from "../rng.js";

/** Rekenteken. De site tekent `*` als ×. */
export type MathOperator = "+" | "-" | "*";

/**
 * Rekenrooster: 3×3 vakjes met verschillende getallen. Tussen de vakjes van elke rij en kolom
 * staan rekentekens; aan het eind van elke rij en onder elke kolom staat de uitkomst.
 * Er wordt **van links naar rechts** (en van boven naar onder) gerekend, zonder voorrang voor ×.
 */
export interface MathGrid {
  /** Rekenvolgorde: altijd van links naar rechts en van boven naar onder, zonder voorrang voor ×. */
  evaluation: "left-to-right";
  /** Getallen komen uit 1 tot en met `max`, elk hoogstens één keer (bij `max` 9: elk precies één keer). */
  max: number;
  /** Per rij de twee rekentekens. */
  rowOperators: [MathOperator, MathOperator][];
  /** Per kolom de twee rekentekens (van boven naar onder). */
  columnOperators: [MathOperator, MathOperator][];
  rowResults: number[];
  columnResults: number[];
  /** Rij voor rij, 9 vakjes; `null` = leeg. */
  givens: (number | null)[];
  solution: number[];
  level: PuzzleLevel;
  seed: Seed;
}

export interface MathGridOptions {
  seed: Seed;
  level: PuzzleLevel;
}

interface MathGridSettings {
  max: number;
  operators: readonly MathOperator[];
  /** Grootste toegestane uitkomst van een rij of kolom. */
  maxResult: number;
  /** Minimaal aantal gegeven vakjes (meer als dat nodig is voor één oplossing). */
  minGivens: number;
}

export const MATH_GRID_LEVELS: Readonly<Record<PuzzleLevel, MathGridSettings>> = {
  starter: { max: 9, operators: ["+", "-"], maxResult: 30, minGivens: 4 },
  "large-print": { max: 9, operators: ["+", "-"], maxResult: 30, minGivens: 4 },
  advanced: { max: 9, operators: ["+", "-", "*"], maxResult: 100, minGivens: 2 },
  expert: { max: 15, operators: ["+", "-", "*"], maxResult: 200, minGivens: 0 },
};

const apply = (a: number, op: MathOperator, b: number) => (op === "+" ? a + b : op === "-" ? a - b : a * b);
const evaluate = (values: readonly number[], ops: readonly MathOperator[]) => apply(apply(values[0] ?? 0, ops[0] ?? "+", values[1] ?? 0), ops[1] ?? "+", values[2] ?? 0);
const ROWS = [[0, 1, 2], [3, 4, 5], [6, 7, 8]] as const;
const COLS = [[0, 3, 6], [1, 4, 7], [2, 5, 8]] as const;

type MathGridRules = Pick<MathGrid, "evaluation" | "max" | "rowOperators" | "columnOperators" | "rowResults" | "columnResults">;

/**
 * Telt de invullingen (verschillende getallen uit 1–`max`) die alle uitkomsten waarmaken, tot `limit`.
 * Negatieve tussenuitkomsten tellen ook mee, zodat "één oplossing" ook geldt voor wie zo rekent.
 */
export function countMathGridSolutions(puzzle: MathGridRules & Pick<MathGrid, "givens">, limit = 2): number {
  let count = 0;
  searchMathGrid(puzzle, puzzle.givens, () => ++count >= limit);
  return count;
}

export function solveMathGrid(puzzle: MathGridRules & Pick<MathGrid, "givens">): number[] | null {
  let found: number[] | null = null;
  searchMathGrid(puzzle, puzzle.givens, (v) => { found = v.slice(); return true; });
  return found;
}

function searchMathGrid(rules: MathGridRules, givens: readonly (number | null)[], visit: (values: readonly number[]) => boolean): void {
  if (givens.length !== 9) throw new RangeError("Een rekenrooster heeft 9 vakjes");
  const { max } = rules;
  // Per rij alle geordende drietallen die bij de gegeven vakjes en de uitkomst passen.
  const options = ROWS.map((cells, r) => {
    const out: number[][] = [];
    const fixed = cells.map((c) => givens[c] ?? null);
    for (let a = 1; a <= max; a++) {
      if (fixed[0] !== null && fixed[0] !== a) continue;
      for (let b = 1; b <= max; b++) {
        if (b === a || (fixed[1] !== null && fixed[1] !== b)) continue;
        for (let c = 1; c <= max; c++) {
          if (c === a || c === b || (fixed[2] !== null && fixed[2] !== c)) continue;
          if (evaluate([a, b, c], rules.rowOperators[r] ?? []) === rules.rowResults[r]) out.push([a, b, c]);
        }
      }
    }
    return out;
  });
  const values: number[] = [];
  const used = new Set<number>();
  const step = (r: number): boolean => {
    if (r === 3) {
      for (let c = 0; c < 3; c++) if (evaluate(COLS[c]?.map((i) => values[i] ?? 0) ?? [], rules.columnOperators[c] ?? []) !== rules.columnResults[c]) return false;
      return visit(values);
    }
    for (const row of options[r] ?? []) {
      if (row.some((v) => used.has(v))) continue;
      values.push(...row); row.forEach((v) => used.add(v));
      if (step(r + 1)) return true;
      values.length -= 3; row.forEach((v) => used.delete(v));
    }
    return false;
  };
  step(0);
}

/** Maakt een rekenrooster met precies één oplossing en alleen tussenuitkomsten van 0 of meer. */
export function generateMathGrid(options: MathGridOptions): MathGrid {
  const { seed, level } = options;
  assertLevel(level);
  const s = MATH_GRID_LEVELS[level];
  const rng = createRng(`mathgrid|${level}|${String(seed)}`);
  for (let attempt = 0; attempt < 200; attempt++) {
    const rules = randomRules(s, rng);
    if (!rules) continue;
    const givens = chooseGivens(rules, s.minGivens, rng);
    return { ...rules, givens, level, seed };
  }
  throw new Error("Kon geen rekenrooster maken");
}

function randomRules(s: MathGridSettings, rng: Rng): (MathGridRules & { solution: number[] }) | null {
  const pool = [...Array(s.max).keys()].map((k) => k + 1);
  const solution = rng.shuffle(pool).slice(0, 9);
  const pickOps = (): [MathOperator, MathOperator] => [rng.pick(s.operators), rng.pick(s.operators)];
  const rowOperators = ROWS.map(pickOps);
  const columnOperators = COLS.map(pickOps);
  const lines = [...ROWS.map((cells, r) => [cells, rowOperators[r]] as const), ...COLS.map((cells, c) => [cells, columnOperators[c]] as const)];
  const results: number[] = [];
  for (const [cells, ops] of lines) {
    const v = cells.map((i) => solution[i] ?? 0);
    const first = apply(v[0] ?? 0, ops?.[0] ?? "+", v[1] ?? 0);
    const total = apply(first, ops?.[1] ?? "+", v[2] ?? 0);
    if (first < 0 || total < 0 || total > s.maxResult) return null;
    results.push(total);
  }
  return { evaluation: "left-to-right", max: s.max, rowOperators, columnOperators, rowResults: results.slice(0, 3), columnResults: results.slice(3), solution };
}

/** Geeft vakjes tot er één oplossing is, haalt overbodige weer weg en vult aan tot `minGivens`. */
function chooseGivens(rules: MathGridRules & { solution: number[] }, minGivens: number, rng: Rng): (number | null)[] {
  const givens: (number | null)[] = new Array<number | null>(9).fill(null);
  const unique = () => countMathGridSolutions({ ...rules, givens }, 2) === 1;
  for (const i of rng.shuffle([...Array(9).keys()])) {
    if (unique()) break;
    givens[i] = rules.solution[i] ?? null;
  }
  for (const i of rng.shuffle([...Array(9).keys()])) {
    if (givens[i] === null) continue;
    givens[i] = null;
    if (!unique()) givens[i] = rules.solution[i] ?? null;
  }
  for (const i of rng.shuffle([...Array(9).keys()])) {
    if (givens.filter((v) => v !== null).length >= minGivens) break;
    givens[i] = rules.solution[i] ?? null;
  }
  return givens;
}

export interface MathGridCheck {
  changedGivens: number[];
  /** Getallen buiten 1–`max` of die vaker voorkomen. */
  invalidCells: number[];
  /** Rijen en kolommen (0–2) die vol zijn maar een andere uitkomst geven. */
  wrongRows: number[];
  wrongColumns: number[];
  complete: boolean;
  solved: boolean;
}

/** Controleert een (deels) ingevuld rooster van een speler. */
export function checkMathGrid(puzzle: MathGridRules & Pick<MathGrid, "givens">, entry: readonly (number | null)[]): MathGridCheck {
  if (entry.length !== 9) throw new RangeError("Een rekenrooster heeft 9 vakjes");
  const changedGivens = puzzle.givens.flatMap((v, i) => (v !== null && entry[i] !== v ? [i] : []));
  const invalidCells = entry.flatMap((v, i) =>
    v !== null && (!Number.isInteger(v) || v < 1 || v > puzzle.max || entry.indexOf(v) !== entry.lastIndexOf(v)) ? [i] : []);
  const wrong = (lines: readonly (readonly number[])[], ops: readonly (readonly MathOperator[])[], results: readonly number[]) =>
    lines.flatMap((cells, k) => {
      const v = cells.map((i) => entry[i] ?? null);
      return v.every((x) => x !== null) && evaluate(v as number[], ops[k] ?? []) !== results[k] ? [k] : [];
    });
  const wrongRows = wrong(ROWS, puzzle.rowOperators, puzzle.rowResults);
  const wrongColumns = wrong(COLS, puzzle.columnOperators, puzzle.columnResults);
  const complete = entry.every((v) => v !== null);
  return { changedGivens, invalidCells, wrongRows, wrongColumns, complete, solved: complete && !changedGivens.length && !invalidCells.length && !wrongRows.length && !wrongColumns.length };
}
