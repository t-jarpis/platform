import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Rng, type Seed } from "./rng.js";
import { must } from "./util.js";

/**
 * Getallenslang: vul het rooster met 1, 2, 3 … tot het laatste getal, zodat elk getal recht naast (niet schuin) het
 * vorige staat. Een paar getallen staan er al; 1 staat er altijd. Eigen generator en eigen naam.
 */
export interface SnakePuzzle {
  size: number;
  givens: (number | null)[];
  solution: number[];
  level: PuzzleLevel;
  seed: Seed;
}

interface SnakeSettings { size: number; keep: number }

export const SNAKE_LEVELS: Readonly<Record<PuzzleLevel, SnakeSettings>> = {
  starter: { size: 5, keep: 0.4 },
  "large-print": { size: 5, keep: 0.3 },
  advanced: { size: 6, keep: 0 },
  expert: { size: 7, keep: 0 },
};

export interface SnakeOptions { seed: Seed; level: PuzzleLevel }

function neighbours(n: number, i: number): number[] {
  const r = Math.floor(i / n), c = i % n, out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

/** Willekeurig pad door alle vakjes: slangetje heen en weer, daarna veel "backbite"-stappen. */
function randomPath(n: number, rng: Rng): number[] {
  let path: number[] = [];
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) path.push(r * n + (r % 2 ? n - 1 - k : k));
  for (let step = 0; step < n * n * 40; step++) {
    if (rng.next() < 0.5) path.reverse();
    const head = must(path[path.length - 1]);
    const pos = new Map(path.map((c, k) => [c, k]));
    const opts = neighbours(n, head).filter((c) => pos.get(c) !== path.length - 2);
    const to = rng.pick(opts);
    const k = must(pos.get(to));
    // head ligt naast path[k]: keer het stuk na k om.
    path = [...path.slice(0, k + 1), ...path.slice(k + 1).reverse()];
  }
  return path;
}

/** Aantal oplossingen, tot `limit`. */
export function countSnakeSolutions(n: number, givens: readonly (number | null)[], limit = 2): number {
  const total = n * n;
  const at = new Map<number, number>();
  givens.forEach((v, i) => { if (v != null) at.set(v, i); });
  const start = at.get(1);
  const nexts = [...at.keys()].sort((a, b) => a - b);
  const taken = new Array<boolean>(total).fill(false);
  givens.forEach((v, i) => { if (v != null) taken[i] = true; });
  let count = 0;
  const reachable = (from: number, remaining: number) => {
    // Alle nog vrije vakjes moeten vanaf hier bereikbaar zijn (via vrije vakjes of gegeven getallen verderop).
    const seen = new Set([from]), stack = [from];
    let free = 0;
    while (stack.length) for (const j of neighbours(n, must(stack.pop()))) {
      if (seen.has(j)) continue;
      const g = givens[j];
      if (!taken[j] || (g != null && g > remaining)) { seen.add(j); if (!taken[j]) free++; stack.push(j); }
    }
    return free;
  };
  let freeLeft = taken.filter((t) => !t).length;
  const go = (v: number, cur: number) => {
    if (count >= limit) return;
    if (v === total) { count++; return; }
    const want = v + 1;
    const fixed = at.get(want);
    if (fixed !== undefined) {
      if (neighbours(n, cur).includes(fixed)) go(want, fixed);
      return;
    }
    const nextGiven = nexts.find((g) => g > want);
    for (const j of neighbours(n, cur)) {
      if (taken[j]) continue;
      if (nextGiven !== undefined) {
        const p = must(at.get(nextGiven));
        const d = Math.abs(Math.floor(p / n) - Math.floor(j / n)) + Math.abs((p % n) - (j % n));
        if (d > nextGiven - want || (nextGiven - want - d) % 2) continue;
      }
      taken[j] = true; freeLeft--;
      if (freeLeft === 0 || reachable(j, want) === freeLeft) go(want, j);
      taken[j] = false; freeLeft++;
      if (count >= limit) return;
    }
  };
  if (start === undefined) return 0;
  go(1, start);
  return count;
}

export function generateSnake(options: SnakeOptions): SnakePuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const set = SNAKE_LEVELS[level];
  const n = set.size;
  const rng = createRng(`snake|${level}|${seed}`);
  const path = randomPath(n, rng);
  const solution = new Array<number>(n * n);
  path.forEach((c, k) => { solution[c] = k + 1; });
  const givens: (number | null)[] = solution.slice();
  const keepAt = Math.ceil(n * n * set.keep);
  let shown = n * n;
  for (const i of rng.shuffle(solution.map((_, i) => i))) {
    if (shown <= keepAt) break;
    if (solution[i] === 1) continue;
    givens[i] = null;
    if (countSnakeSolutions(n, givens) === 1) shown--;
    else givens[i] = must(solution[i]);
  }
  return { size: n, givens, solution, level, seed };
}
