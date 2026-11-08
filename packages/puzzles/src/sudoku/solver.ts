import type { Rng } from "../rng.js";
import { assertGrid, geometry, maskValues, popcount, type Geometry, type SudokuSize } from "./grid.js";

interface SearchResult {
  count: number;
  solution: number[] | null;
}

/**
 * Backtracking met bitmaskers en "minst aantal kandidaten eerst". Stopt zodra `limit` oplossingen
 * gevonden zijn. Met `rng` worden kandidaten in willekeurige volgorde geprobeerd (voor volle roosters).
 */
function search(start: readonly number[], geo: Geometry, limit: number, rng?: Rng): SearchResult {
  const { size, cells, rowOf, colOf, boxOf } = geo;
  const grid = start.slice();
  const rowM = new Array<number>(size).fill(0);
  const colM = new Array<number>(size).fill(0);
  const boxM = new Array<number>(size).fill(0);
  const empties: number[] = [];
  for (let i = 0; i < cells; i++) {
    const v = grid[i] ?? 0;
    if (v === 0) { empties.push(i); continue; }
    const bit = 1 << (v - 1);
    const r = rowOf[i] ?? 0, c = colOf[i] ?? 0, b = boxOf[i] ?? 0;
    if ((rowM[r] ?? 0) & bit || (colM[c] ?? 0) & bit || (boxM[b] ?? 0) & bit) return { count: 0, solution: null };
    rowM[r] = (rowM[r] ?? 0) | bit; colM[c] = (colM[c] ?? 0) | bit; boxM[b] = (boxM[b] ?? 0) | bit;
  }
  const full = (1 << size) - 1;
  let count = 0;
  let solution: number[] | null = null;

  const rec = (): boolean => {
    let best = -1, bestMask = 0, bestCount = size + 1;
    for (const i of empties) {
      if (grid[i] !== 0) continue;
      const mask = full & ~((rowM[rowOf[i] ?? 0] ?? 0) | (colM[colOf[i] ?? 0] ?? 0) | (boxM[boxOf[i] ?? 0] ?? 0));
      const n = popcount(mask);
      if (n === 0) return false;
      if (n < bestCount) { best = i; bestMask = mask; bestCount = n; if (n === 1) break; }
    }
    if (best === -1) {
      count++;
      solution ??= grid.slice();
      return count >= limit;
    }
    const r = rowOf[best] ?? 0, c = colOf[best] ?? 0, b = boxOf[best] ?? 0;
    const values = rng ? rng.shuffle(maskValues(bestMask)) : maskValues(bestMask);
    for (const v of values) {
      const bit = 1 << (v - 1);
      grid[best] = v;
      rowM[r] = (rowM[r] ?? 0) | bit; colM[c] = (colM[c] ?? 0) | bit; boxM[b] = (boxM[b] ?? 0) | bit;
      const stop = rec();
      rowM[r] = (rowM[r] ?? 0) & ~bit; colM[c] = (colM[c] ?? 0) & ~bit; boxM[b] = (boxM[b] ?? 0) & ~bit;
      grid[best] = 0;
      if (stop) return true;
    }
    return false;
  };
  rec();
  return { count, solution };
}

/**
 * Telt oplossingen tot en met `limit` (standaard 2: genoeg om te weten of er precies één is).
 * Een rooster met botsende cijfers heeft 0 oplossingen.
 */
export function countSolutions(givens: readonly number[], size: SudokuSize, limit = 2): number {
  assertGrid(givens, size);
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit moet een positief geheel getal zijn");
  return search(givens, geometry(size), limit).count;
}

/** Lost een sudoku op. Geeft de eerste gevonden oplossing, of `null` als er geen is. */
export function solveSudoku(givens: readonly number[], size: SudokuSize): number[] | null {
  assertGrid(givens, size);
  return search(givens, geometry(size), 1).solution;
}

/** Willekeurig, volledig ingevuld geldig rooster. */
export function randomSolution(size: SudokuSize, rng: Rng): number[] {
  const geo = geometry(size);
  const solution = search(new Array<number>(geo.cells).fill(0), geo, 1, rng).solution;
  if (!solution) throw new Error("Geen vol rooster gevonden (kan niet gebeuren)");
  return solution;
}
