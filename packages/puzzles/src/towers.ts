import { permutations, randomLatinSquare } from "./latin.js";
import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Seed } from "./rng.js";
import { must } from "./util.js";

/**
 * Torenpuzzel: zet in elk vakje een toren van hoogte 1..n, elke hoogte één keer per rij en kolom. Een getal aan de
 * rand zegt hoeveel torens je vanaf die kant ziet (een hogere toren verbergt de lagere erachter). Eigen generator
 * en eigen naam.
 *
 * Randen: `top[k]` boven kolom k (kijkend naar beneden), `bottom[k]` eronder, `left[r]` links van rij r, `right[r]`
 * rechts. `null` = geen getal.
 */
export interface TowersPuzzle {
  size: number;
  top: (number | null)[];
  bottom: (number | null)[];
  left: (number | null)[];
  right: (number | null)[];
  givens: (number | null)[];
  solution: number[];
  level: PuzzleLevel;
  seed: Seed;
}

interface TowersSettings { size: number; givens: number; keepClues: number }

export const TOWERS_LEVELS: Readonly<Record<PuzzleLevel, TowersSettings>> = {
  starter: { size: 4, givens: 2, keepClues: 0.75 },
  "large-print": { size: 4, givens: 1, keepClues: 0.6 },
  advanced: { size: 5, givens: 0, keepClues: 0 },
  expert: { size: 6, givens: 0, keepClues: 0 },
};

export interface TowersOptions { seed: Seed; level: PuzzleLevel }

/** Hoeveel torens je ziet in deze volgorde (de eerste staat het dichtst bij). */
export function visibleTowers(line: readonly number[]): number {
  let max = 0, seen = 0;
  for (const h of line) if (h > max) { max = h; seen++; }
  return seen;
}

type Clues = Pick<TowersPuzzle, "size" | "top" | "bottom" | "left" | "right" | "givens">;

const permCache = new Map<number, number[][]>();

/** Aantal oplossingen, tot `limit`. Rij voor rij uit de permutaties die bij de randgetallen van die rij passen. */
export function countTowersSolutions(c: Clues, limit = 2): number {
  const n = c.size;
  let all = permCache.get(n);
  if (!all) { all = permutations(n); permCache.set(n, all); }
  const rows = Array.from({ length: n }, (_, r) => must(all).filter((p) =>
    (c.left[r] == null || visibleTowers(p) === c.left[r]) &&
    (c.right[r] == null || visibleTowers([...p].reverse()) === c.right[r]) &&
    p.every((v, k) => c.givens[r * n + k] == null || c.givens[r * n + k] === v)));
  // Per kolom alle beginstukken van kolommen die bij de randgetallen en gegeven cijfers passen: na elke rij moet
  // elke kolom zo'n beginstuk zijn. Dat snoeit veel sterker dan alleen "geen dubbele in een kolom".
  const prefixes = Array.from({ length: n }, (_, k) => {
    const set = new Set<string>();
    for (const p of must(all)) {
      if (c.top[k] != null && visibleTowers(p) !== c.top[k]) continue;
      if (c.bottom[k] != null && visibleTowers([...p].reverse()) !== c.bottom[k]) continue;
      if (!p.every((v, r) => c.givens[r * n + k] == null || c.givens[r * n + k] === v)) continue;
      for (let len = 1; len <= n; len++) set.add(p.slice(0, len).join(""));
    }
    return set;
  });
  const cols = Array.from({ length: n }, () => "");
  let count = 0;
  const go = (r: number) => {
    if (count >= limit) return;
    if (r === n) { count++; return; }
    for (const p of must(rows[r])) {
      if (!p.every((v, k) => must(prefixes[k]).has(must(cols[k]) + v))) continue;
      p.forEach((v, k) => { cols[k] += String(v); });
      go(r + 1);
      p.forEach((_, k) => { cols[k] = must(cols[k]).slice(0, -1); });
      if (count >= limit) return;
    }
  };
  go(0);
  return count;
}

export function generateTowers(options: TowersOptions): TowersPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const set = TOWERS_LEVELS[level];
  const n = set.size;
  const rng = createRng(`towers|${level}|${seed}`);
  const solution = randomLatinSquare(n, rng);
  const row = (r: number) => solution.slice(r * n, r * n + n);
  const colOf = (k: number) => Array.from({ length: n }, (_, r) => must(solution[r * n + k]));
  const p: Clues = {
    size: n,
    top: Array.from({ length: n }, (_, k) => visibleTowers(colOf(k))),
    bottom: Array.from({ length: n }, (_, k) => visibleTowers(colOf(k).reverse())),
    left: Array.from({ length: n }, (_, r) => visibleTowers(row(r))),
    right: Array.from({ length: n }, (_, r) => visibleTowers(row(r).reverse())),
    givens: solution.map(() => null),
  };
  for (const i of rng.shuffle(solution.map((_, i) => i)).slice(0, set.givens)) p.givens[i] = must(solution[i]);
  for (const i of rng.shuffle(solution.map((_, i) => i))) {
    if (countTowersSolutions(p) === 1) break;
    p.givens[i] = must(solution[i]);
  }
  const sides = ["top", "bottom", "left", "right"] as const;
  const clues = rng.shuffle(sides.flatMap((s) => Array.from({ length: n }, (_, k) => [s, k] as const)));
  let left = clues.length;
  for (const [s, k] of clues) {
    if (left <= Math.ceil(clues.length * set.keepClues)) break;
    const before = must(p[s][k]);
    p[s][k] = null;
    if (countTowersSolutions(p) === 1) left--;
    else p[s][k] = before;
  }
  return { ...p, solution, level, seed };
}
