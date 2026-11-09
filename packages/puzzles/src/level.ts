/**
 * Gedeelde niveaus voor de puzzels naast sudoku. Wat een niveau precies betekent, verschilt per
 * puzzel (zie de README); `large-print` is steeds een makkelijke variant die geschikt is om groot af te drukken.
 */
export type PuzzleLevel = "starter" | "advanced" | "expert" | "large-print";

export const PUZZLE_LEVELS: readonly PuzzleLevel[] = ["starter", "advanced", "expert", "large-print"];

export function assertLevel(level: unknown): asserts level is PuzzleLevel {
  if (!PUZZLE_LEVELS.includes(level as PuzzleLevel)) throw new RangeError(`Onbekend niveau "${String(level)}"`);
}
