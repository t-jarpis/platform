import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Rng, type Seed } from "./rng.js";
import { must } from "./util.js";

/**
 * Bruggen bouwen: eilanden met een getal liggen in een rooster. Verbind ze met rechte bruggen (horizontaal of
 * verticaal, één of twee tussen hetzelfde paar) zodat elk eiland zoveel bruggen heeft als zijn getal, bruggen
 * elkaar niet kruisen en alle eilanden samen één geheel vormen. Eigen generator en eigen naam.
 */
export interface BridgeIsland { x: number; y: number; n: number }
export interface Bridge { a: number; b: number; count: 1 | 2 }

export interface BridgesPuzzle {
  width: number;
  height: number;
  islands: BridgeIsland[];
  /** De enige oplossing; `a` < `b` zijn indexen in `islands`. */
  solution: Bridge[];
  level: PuzzleLevel;
  seed: Seed;
}

interface BridgesSettings { size: number; islands: number; loops: number }

export const BRIDGES_LEVELS: Readonly<Record<PuzzleLevel, BridgesSettings>> = {
  starter: { size: 7, islands: 8, loops: 0 },
  "large-print": { size: 7, islands: 9, loops: 0.2 },
  advanced: { size: 9, islands: 14, loops: 0.3 },
  expert: { size: 11, islands: 20, loops: 0.4 },
};

export interface BridgesOptions { seed: Seed; level: PuzzleLevel }

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

interface Edge { a: number; b: number; cells: number[]; horizontal: boolean }

/** Alle paren eilanden die elkaar zien (recht, niets ertussen), met de vakjes ertussen. */
export function bridgeCandidates(width: number, height: number, islands: readonly { x: number; y: number }[]): Edge[] {
  const at = new Map(islands.map((p, i) => [p.y * width + p.x, i]));
  const out: Edge[] = [];
  islands.forEach((p, a) => {
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const cells: number[] = [];
      for (let x = p.x + dx, y = p.y + dy; x < width && y < height; x += dx, y += dy) {
        const b = at.get(y * width + x);
        if (b !== undefined) { if (cells.length) out.push({ a: Math.min(a, b), b: Math.max(a, b), cells, horizontal: dy === 0 }); break; }
        cells.push(y * width + x);
      }
    }
  });
  return out;
}

/** Aantal oplossingen, tot `limit`; `null` als de zoektocht te lang duurt. */
export function countBridgesSolutions(width: number, height: number, islands: readonly BridgeIsland[], limit = 2, budget = 400_000): number | null {
  const edges = bridgeCandidates(width, height, islands);
  // Kruisingen: een horizontale en een verticale brug over hetzelfde vakje.
  const crosses = edges.map(() => [] as number[]);
  const byCell = new Map<number, number[]>();
  edges.forEach((e, i) => e.cells.forEach((c) => byCell.set(c, [...(byCell.get(c) ?? []), i])));
  for (const list of byCell.values()) for (const i of list) for (const j of list) if (i !== j && must(edges[i]).horizontal !== must(edges[j]).horizontal) must(crosses[i]).push(j);
  const order = edges.map((_, i) => i).sort((i, j) => Math.min(must(edges[i]).a, must(edges[i]).b) - Math.min(must(edges[j]).a, must(edges[j]).b) || must(edges[i]).b - must(edges[j]).b);
  const left = islands.map((p) => p.n);
  const open = islands.map(() => 0); // nog niet beslist: maximaal 2 per rand
  edges.forEach((e) => { open[e.a] = must(open[e.a]) + (2); open[e.b] = must(open[e.b]) + (2); });
  const value = edges.map(() => 0);
  let count = 0, steps = 0;
  const connected = () => {
    const adj = islands.map(() => [] as number[]);
    edges.forEach((e, i) => { if (value[i]) { must(adj[e.a]).push(e.b); must(adj[e.b]).push(e.a); } });
    const seen = new Set([0]), stack = [0];
    while (stack.length) for (const j of must(adj[must(stack.pop())])) if (!seen.has(j)) { seen.add(j); stack.push(j); }
    return seen.size === islands.length;
  };
  const go = (k: number): boolean => {
    if (++steps > budget) return false;
    if (k === order.length) {
      if (left.every((v) => v === 0) && connected()) count++;
      return count < limit;
    }
    const i = must(order[k]), e = must(edges[i]);
    open[e.a] = must(open[e.a]) - (2); open[e.b] = must(open[e.b]) - (2);
    const blocked = must(crosses[i]).some((j) => value[j]);
    for (let v = 0; v <= (blocked ? 0 : 2); v++) {
      if (must(left[e.a]) < v || must(left[e.b]) < v) break;
      left[e.a] = must(left[e.a]) - (v); left[e.b] = must(left[e.b]) - (v); value[i] = v;
      if (must(left[e.a]) <= must(open[e.a]) && must(left[e.b]) <= must(open[e.b])) { if (!go(k + 1)) { left[e.a] = must(left[e.a]) + (v); left[e.b] = must(left[e.b]) + (v); value[i] = 0; open[e.a] = must(open[e.a]) + (2); open[e.b] = must(open[e.b]) + (2); return false; } }
      left[e.a] = must(left[e.a]) + (v); left[e.b] = must(left[e.b]) + (v); value[i] = 0;
    }
    open[e.a] = must(open[e.a]) + (2); open[e.b] = must(open[e.b]) + (2);
    return true;
  };
  const finished = go(0);
  if (!finished && steps > budget) return null;
  return count;
}

function build(size: number, target: number, loops: number, rng: Rng): { islands: { x: number; y: number }[]; bridges: Bridge[] } {
  const islands: { x: number; y: number }[] = [{ x: rng.int(size), y: rng.int(size) }];
  const isle = new Map<number, number>([[must(islands[0]).y * size + must(islands[0]).x, 0]]);
  const used = new Set<number>(); // vakjes onder een brug
  const bridges: Bridge[] = [];
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && !isle.has(y * size + x) && !used.has(y * size + x);
  const lonely = (x: number, y: number) => DIRS.every(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx < 0 || ny < 0 || nx >= size || ny >= size || !isle.has(ny * size + nx);
  });
  for (let tries = 0; islands.length < target && tries < target * 60; tries++) {
    const from = rng.int(islands.length), p = must(islands[from]);
    const [dx, dy] = rng.pick(DIRS);
    const dist = 2 + rng.int(Math.max(1, Math.floor(size / 2)));
    const x = p.x + dx * dist, y = p.y + dy * dist;
    if (!free(x, y) || !lonely(x, y)) continue;
    const between: number[] = [];
    let ok = true;
    for (let k = 1; k < dist; k++) {
      const cx = p.x + dx * k, cy = p.y + dy * k;
      if (!free(cx, cy)) { ok = false; break; }
      between.push(cy * size + cx);
    }
    if (!ok) continue;
    const to = islands.length;
    islands.push({ x, y });
    isle.set(y * size + x, to);
    between.forEach((c) => used.add(c));
    bridges.push({ a: Math.min(from, to), b: Math.max(from, to), count: rng.next() < 0.35 ? 2 : 1 });
  }
  // Extra bruggen tussen eilanden die elkaar al zien: lussen maken het lastiger.
  for (const e of rng.shuffle(bridgeCandidates(size, size, islands))) {
    if (rng.next() >= loops || bridges.some((b) => b.a === e.a && b.b === e.b) || e.cells.some((c) => used.has(c))) continue;
    e.cells.forEach((c) => used.add(c));
    bridges.push({ a: e.a, b: e.b, count: rng.next() < 0.3 ? 2 : 1 });
  }
  return { islands, bridges };
}

export function generateBridges(options: BridgesOptions): BridgesPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const set = BRIDGES_LEVELS[level];
  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = createRng(`bridges|${level}|${seed}|${attempt}`);
    const target = Math.max(4, set.islands - Math.floor(attempt / 40));
    const { islands: spots, bridges } = build(set.size, target, set.loops, rng);
    if (spots.length < target) continue;
    const islands = spots.map((p, i) => ({ ...p, n: bridges.filter((b) => b.a === i || b.b === i).reduce((s, b) => s + b.count, 0) }));
    if (countBridgesSolutions(set.size, set.size, islands) !== 1) continue;
    // Eilanden op volgorde van het rooster (rij voor rij), zodat de indexen niets verraden.
    const order = islands.map((_, i) => i).sort((i, j) => must(islands[i]).y - must(islands[j]).y || must(islands[i]).x - must(islands[j]).x);
    const rank = new Map(order.map((old, k) => [old, k]));
    const solution = bridges.map((b) => {
      const a = must(rank.get(b.a)), c = must(rank.get(b.b));
      return { a: Math.min(a, c), b: Math.max(a, c), count: b.count };
    }).sort((p, q) => p.a - q.a || p.b - q.b);
    return { width: set.size, height: set.size, islands: order.map((i) => must(islands[i])), solution, level, seed };
  }
  throw new Error("Geen bruggenpuzzel met één oplossing gevonden");
}
