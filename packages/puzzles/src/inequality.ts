import { randomLatinSquare } from "./latin.js";
import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Seed } from "./rng.js";
import { must } from "./util.js";

/**
 * Groter-kleiner: vul een n×n rooster met 1..n zodat elk cijfer één keer per rij en kolom staat, en elk teken
 * tussen twee vakjes klopt. Bekend onder andere namen; dit is een eigen generator met een eigen naam.
 *
 * `right[i]`: teken tussen vakje i en zijn rechterbuur (`"<"`: links is kleiner, `">"`: links is groter).
 * `down[i]`: teken tussen vakje i en het vakje eronder (`"<"`: boven is kleiner, `">"`: boven is groter).
 */
export type InequalitySign = "<" | ">";

export interface InequalityPuzzle {
  size: number;
  givens: (number | null)[];
  right: (InequalitySign | null)[];
  down: (InequalitySign | null)[];
  solution: number[];
  level: PuzzleLevel;
  seed: Seed;
}

interface InequalitySettings { size: number; givens: number; keepSigns: number }

export const INEQUALITY_LEVELS: Readonly<Record<PuzzleLevel, InequalitySettings>> = {
  starter: { size: 4, givens: 3, keepSigns: 0.6 },
  "large-print": { size: 4, givens: 2, keepSigns: 0.45 },
  advanced: { size: 5, givens: 1, keepSigns: 0 },
  expert: { size: 6, givens: 0, keepSigns: 0 },
};

export interface InequalityOptions { seed: Seed; level: PuzzleLevel }

interface Clues { size: number; givens: (number | null)[]; right: (InequalitySign | null)[]; down: (InequalitySign | null)[] }

const holds = (a: number, s: InequalitySign, b: number) => (s === "<" ? a < b : a > b);

/** Aantal oplossingen, tot `limit`. */
export function countInequalitySolutions(c: Clues, limit = 2): number {
  const n = c.size;
  const grid = c.givens.map((g) => g ?? 0);
  const row = Array.from({ length: n }, () => 0), col = Array.from({ length: n }, () => 0);
  for (let i = 0; i < n * n; i++) {
    const v = must(grid[i]);
    if (!v) continue;
    const r = Math.floor(i / n), k = i % n, bit = 1 << v;
    if (must(row[r]) & bit || must(col[k]) & bit) return 0;
    row[r] = must(row[r]) | (bit); col[k] = must(col[k]) | (bit);
  }
  let count = 0;
  const ok = (i: number, v: number) => {
    const r = Math.floor(i / n), k = i % n;
    if (k > 0) { const s = c.right[i - 1], a = must(grid[i - 1]); if (s && a && !holds(a, s, v)) return false; }
    if (k < n - 1) { const s = c.right[i], b = must(grid[i + 1]); if (s && b && !holds(v, s, b)) return false; }
    if (r > 0) { const s = c.down[i - n], a = must(grid[i - n]); if (s && a && !holds(a, s, v)) return false; }
    if (r < n - 1) { const s = c.down[i], b = must(grid[i + n]); if (s && b && !holds(v, s, b)) return false; }
    return true;
  };
  const go = (i: number) => {
    if (count >= limit) return;
    if (i === n * n) { count++; return; }
    if (grid[i]) { if (ok(i, must(grid[i]))) go(i + 1); return; }
    const r = Math.floor(i / n), k = i % n;
    for (let v = 1; v <= n; v++) {
      const bit = 1 << v;
      if (must(row[r]) & bit || must(col[k]) & bit || !ok(i, v)) continue;
      grid[i] = v; row[r] = must(row[r]) | (bit); col[k] = must(col[k]) | (bit);
      go(i + 1);
      grid[i] = 0; row[r] = must(row[r]) & (~bit); col[k] = must(col[k]) & (~bit);
      if (count >= limit) return;
    }
  };
  go(0);
  return count;
}

export function generateInequality(options: InequalityOptions): InequalityPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const set = INEQUALITY_LEVELS[level];
  const n = set.size;
  const rng = createRng(`inequality|${level}|${seed}`);
  const solution = randomLatinSquare(n, rng);
  const right: (InequalitySign | null)[] = solution.map((v, i) => (i % n < n - 1 ? (v < must(solution[i + 1]) ? "<" : ">") : null));
  const down: (InequalitySign | null)[] = solution.map((v, i) => (i + n < n * n ? (v < must(solution[i + n]) ? "<" : ">") : null));
  const givens: (number | null)[] = solution.map(() => null);
  for (const i of rng.shuffle(solution.map((_, i) => i)).slice(0, set.givens)) givens[i] = must(solution[i]);
  const clues: Clues = { size: n, givens, right, down };
  // Met alle tekens is het (bijna) altijd uniek; anders cijfers erbij tot het uniek is.
  for (const i of rng.shuffle(solution.map((_, i) => i))) {
    if (countInequalitySolutions(clues) === 1) break;
    givens[i] = must(solution[i]);
  }
  // Tekens weghalen zolang er één oplossing blijft, tot het minimum voor het niveau.
  const signs = rng.shuffle([...right.map((s, i) => ["right", i] as const).filter(([, i]) => right[i]), ...down.map((s, i) => ["down", i] as const).filter(([, i]) => down[i])]);
  const total = signs.length;
  let left = total;
  for (const [kind, i] of signs) {
    if (left <= Math.ceil(total * set.keepSigns)) break;
    const list = kind === "right" ? right : down;
    const before = must(list[i]);
    list[i] = null;
    if (countInequalitySolutions(clues) === 1) left--;
    else list[i] = before;
  }
  // Op gevorderd en expert ook gegeven cijfers weghalen waar dat kan.
  if (set.keepSigns === 0) {
    for (const i of rng.shuffle(givens.map((_, i) => i).filter((i) => givens[i] !== null))) {
      const before = must(givens[i]);
      givens[i] = null;
      if (countInequalitySolutions(clues) !== 1) givens[i] = before;
    }
  }
  return { size: n, givens, right, down, solution, level, seed };
}

/** Wat er in een (deels) ingevuld rooster botst: dubbel in rij of kolom, of een teken dat niet klopt. Geen oplossing. */
export function inequalityConflicts(p: Pick<InequalityPuzzle, "size" | "right" | "down">, grid: readonly (number | null)[]): Set<number> {
  const n = p.size, bad = new Set<number>();
  for (let i = 0; i < n * n; i++) {
    const v = grid[i];
    if (!v) continue;
    const r = Math.floor(i / n), k = i % n;
    for (let j = 0; j < n; j++) {
      if (j !== k && grid[r * n + j] === v) bad.add(i);
      if (j !== r && grid[j * n + k] === v) bad.add(i);
    }
    const s = p.right[i], b = grid[i + 1];
    if (s && b && !holds(v, s, b)) { bad.add(i); bad.add(i + 1); }
    const t = p.down[i], d = grid[i + n];
    if (t && d && !holds(v, t, d)) { bad.add(i); bad.add(i + n); }
  }
  return bad;
}
