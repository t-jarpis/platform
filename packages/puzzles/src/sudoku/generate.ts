import { createRng, type Rng, type Seed } from "../rng.js";
import { boxFor, geometry, type Box, type Geometry, type SudokuSize } from "./grid.js";
import { grade, SINGLES, type Technique } from "./logic.js";
import { countSolutions, randomSolution } from "./solver.js";

/**
 * Niveaus:
 * - `starter`: veel gegeven cijfers, op te lossen met alleen singles.
 * - `advanced`: minder gegeven cijfers, nog steeds alleen singles.
 * - `expert`: zo min mogelijk gegeven cijfers; vraagt minstens één techniek voorbij singles
 *   (lukt dat niet binnen het aantal pogingen, dan de poging met de minste gegeven cijfers).
 * - `large-print`: makkelijke 9×9 (zelfde regels als `starter` op 9×9), bedoeld voor grote letters.
 */
export type SudokuLevel = "starter" | "advanced" | "expert" | "large-print";

export const SUDOKU_LEVELS: readonly SudokuLevel[] = ["starter", "advanced", "expert", "large-print"];

export interface SudokuOptions {
  /** 4, 6 of 9. Bij `large-print` mag je hem weglaten (altijd 9). */
  size?: SudokuSize;
  level: SudokuLevel;
  seed: Seed;
}

export interface SudokuDifficulty {
  /** Som van de techniekpunten over alle stappen (zie `TECHNIQUE_WEIGHTS`). Hoger is moeilijker. */
  score: number;
  /** Benodigde technieken, van makkelijk naar moeilijk. */
  techniques: Technique[];
}

export interface Sudoku {
  size: SudokuSize;
  box: Box;
  /** Rij voor rij; 0 = leeg vakje. */
  givens: number[];
  /** Rij voor rij, volledig ingevuld. */
  solution: number[];
  level: SudokuLevel;
  seed: Seed;
  difficulty: SudokuDifficulty;
}

/** Bereik [min, max] van gegeven cijfers voor de makkelijke niveaus. */
export const GIVENS_RANGE: Readonly<Record<SudokuSize, Readonly<Record<"starter" | "advanced", readonly [number, number]>>>> = {
  4: { starter: [8, 9], advanced: [6, 7] },
  6: { starter: [18, 20], advanced: [13, 15] },
  9: { starter: [36, 40], advanced: [28, 31] },
};

const ATTEMPTS = { easy: 30, expert: { 4: 6, 6: 12, 9: 12 } } as const;

/**
 * Maakt een sudoku met precies één oplossing. Volledig deterministisch: dezelfde opties geven
 * altijd dezelfde puzzel. Formaat en niveau tellen mee in de seed, dus `seed: 1` op twee niveaus
 * geeft twee verschillende puzzels.
 */
export function generateSudoku(options: SudokuOptions): Sudoku {
  const { level, seed } = options;
  if (!SUDOKU_LEVELS.includes(level)) throw new RangeError(`Onbekend niveau "${String(level)}"`);
  const size: SudokuSize = options.size ?? 9;
  if (level === "large-print" && size !== 9) throw new RangeError("large-print bestaat alleen als 9×9");
  const geo = geometry(size);
  const rng = createRng(`sudoku|${size}|${level}|${String(seed)}`);

  const { puzzle, solution } = level === "expert" ? expert(geo, rng) : easy(geo, rng, GIVENS_RANGE[size][level === "advanced" ? "advanced" : "starter"]);
  // Vangnet: de logica garandeert al één oplossing, de teller controleert dat onafhankelijk.
  if (countSolutions(puzzle, size) !== 1) throw new Error("Gegenereerde sudoku heeft geen unieke oplossing");
  const g = grade(puzzle, geo, true);
  return {
    size,
    box: boxFor(size),
    givens: puzzle,
    solution,
    level,
    seed,
    difficulty: { score: g.score, techniques: g.techniques },
  };
}

interface Candidate {
  puzzle: number[];
  solution: number[];
}

const filledCount = (grid: readonly number[]) => grid.reduce((n, v) => (v ? n + 1 : n), 0);

/**
 * Haalt in willekeurige volgorde cijfers weg zolang de puzzel met de toegestane technieken
 * oplosbaar blijft, tot er `target` gegeven cijfers over zijn (0 = zo ver als het gaat).
 */
function reduce(solution: readonly number[], geo: Geometry, rng: Rng, target: number, advanced: boolean): number[] {
  const puzzle = solution.slice();
  let left = geo.cells;
  for (const i of rng.shuffle([...puzzle.keys()])) {
    if (left <= target) break;
    const v = puzzle[i] ?? 0;
    puzzle[i] = 0;
    if (grade(puzzle, geo, advanced).solved) left--;
    else puzzle[i] = v;
  }
  return puzzle;
}

function easy(geo: Geometry, rng: Rng, [min, max]: readonly [number, number]): Candidate {
  let best: Candidate | null = null;
  for (let attempt = 0; attempt < ATTEMPTS.easy; attempt++) {
    const solution = randomSolution(geo.size, rng);
    const target = min + rng.int(max - min + 1);
    const puzzle = reduce(solution, geo, rng, target, false);
    const candidate = { puzzle, solution };
    if (filledCount(puzzle) <= max) return candidate;
    if (!best || filledCount(puzzle) < filledCount(best.puzzle)) best = candidate;
  }
  return best as Candidate;
}

function expert(geo: Geometry, rng: Rng): Candidate {
  let best: Candidate | null = null;
  for (let attempt = 0; attempt < ATTEMPTS.expert[geo.size]; attempt++) {
    const solution = randomSolution(geo.size, rng);
    const puzzle = reduce(solution, geo, rng, 0, true);
    const candidate = { puzzle, solution };
    if (grade(puzzle, geo, true).techniques.some((t) => !SINGLES.includes(t))) return candidate;
    if (!best || filledCount(puzzle) < filledCount(best.puzzle)) best = candidate;
  }
  return best as Candidate;
}
