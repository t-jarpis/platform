import { assertGrid, geometry, type SudokuSize } from "./grid.js";

/**
 * Vakjes (indexen, rij voor rij) waarvan het cijfer botst met hetzelfde cijfer in dezelfde rij,
 * kolom of vak. Lege vakjes (0) botsen nooit. Gebruikt alleen de spelregels, geen oplossing,
 * dus dit mag later ook in de browser draaien.
 */
export function conflicts(grid: readonly number[], size: SudokuSize): number[] {
  assertGrid(grid, size);
  const { units } = geometry(size);
  const bad = new Set<number>();
  for (const unit of units) {
    const seen = new Map<number, number[]>();
    for (const i of unit) {
      const v = grid[i] ?? 0;
      if (!v) continue;
      const list = seen.get(v);
      if (list) list.push(i);
      else seen.set(v, [i]);
    }
    for (const list of seen.values()) if (list.length > 1) for (const i of list) bad.add(i);
  }
  return [...bad].sort((a, b) => a - b);
}

export interface SudokuEntryCheck {
  /** Vakjes die botsen volgens de spelregels. */
  conflicts: number[];
  /** Vakjes waar een gegeven cijfer is veranderd of gewist. */
  changedGivens: number[];
  /** Alle vakjes zijn ingevuld. */
  complete: boolean;
  /** Ingevuld, zonder botsingen en met alle gegeven cijfers intact. Omdat de puzzel één oplossing heeft, is dit dé oplossing. */
  solved: boolean;
}

/** Controleert een (deels) ingevuld rooster van een speler tegen de gegeven cijfers. */
export function validateSudokuEntry(givens: readonly number[], entry: readonly number[], size: SudokuSize): SudokuEntryCheck {
  assertGrid(givens, size);
  const bad = conflicts(entry, size);
  const changedGivens = givens.flatMap((v, i) => (v !== 0 && entry[i] !== v ? [i] : []));
  const complete = entry.every((v) => v !== 0);
  return { conflicts: bad, changedGivens, complete, solved: complete && bad.length === 0 && changedGivens.length === 0 };
}
