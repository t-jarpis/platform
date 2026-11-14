import type { Rng } from "./rng.js";
import { must } from "./util.js";

/**
 * Willekeurig Latijns vierkant van n×n (elke rij en kolom bevat 1..n precies één keer), rij voor rij.
 * Backtracking met geschudde kandidaten, dus elke vorm kan voorkomen (niet alleen verschoven rijen).
 */
export function randomLatinSquare(n: number, rng: Rng): number[] {
  const grid = new Array<number>(n * n).fill(0);
  const rowUsed = Array.from({ length: n }, () => new Set<number>());
  const colUsed = Array.from({ length: n }, () => new Set<number>());
  const fill = (i: number): boolean => {
    if (i === n * n) return true;
    const r = Math.floor(i / n), c = i % n;
    for (const v of rng.shuffle(Array.from({ length: n }, (_, k) => k + 1))) {
      if (must(rowUsed[r]).has(v) || must(colUsed[c]).has(v)) continue;
      grid[i] = v; must(rowUsed[r]).add(v); must(colUsed[c]).add(v);
      if (fill(i + 1)) return true;
      must(rowUsed[r]).delete(v); must(colUsed[c]).delete(v);
    }
    grid[i] = 0;
    return false;
  };
  fill(0);
  return grid;
}

/** Alle permutaties van 1..n (n ≤ 7). */
export function permutations(n: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Array<boolean>(n + 1).fill(false);
  const go = () => {
    if (cur.length === n) { out.push(cur.slice()); return; }
    for (let v = 1; v <= n; v++) {
      if (used[v]) continue;
      used[v] = true; cur.push(v); go(); cur.pop(); used[v] = false;
    }
  };
  go();
  return out;
}
