import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Rng, type Seed } from "./rng.js";
import { must } from "./util.js";

/**
 * Zeeslagpuzzel: verstop een vloot rechte schepen in een vierkant rooster. Schepen raken elkaar niet, ook niet
 * schuin. Langs de rand staat per rij en kolom hoeveel vakjes schip zijn; een paar vakjes zijn al open (schip of
 * water). Eigen generator en eigen naam; niet het bordspel.
 */
export interface FleetPuzzle {
  size: number;
  /** Lengtes van de schepen, van lang naar kort. */
  fleet: number[];
  rows: number[];
  cols: number[];
  /** Open vakjes: `"ship"`, `"water"` of `null` (dicht). */
  revealed: ("ship" | "water" | null)[];
  /** `true` = schip. */
  solution: boolean[];
  level: PuzzleLevel;
  seed: Seed;
}

interface FleetSettings { size: number; fleet: number[]; keep: number }

export const FLEET_LEVELS: Readonly<Record<PuzzleLevel, FleetSettings>> = {
  starter: { size: 6, fleet: [3, 2, 2, 1, 1], keep: 4 },
  "large-print": { size: 6, fleet: [3, 2, 2, 1, 1], keep: 3 },
  advanced: { size: 8, fleet: [4, 3, 2, 2, 1, 1, 1], keep: 0 },
  expert: { size: 10, fleet: [4, 3, 3, 2, 2, 2, 1, 1, 1, 1], keep: 0 },
};

export interface FleetOptions { seed: Seed; level: PuzzleLevel }

interface Placement { cells: number[]; zone: number[] }

/** Alle plaatsingen van een schip van lengte len, met de vakjes eromheen (zone, inclusief schuin). */
function placements(n: number, len: number): Placement[] {
  const out: Placement[] = [];
  const add = (cells: [number, number][]) => {
    const zone = new Set<number>();
    for (const [r, c] of cells) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < n && cc < n) zone.add(rr * n + cc);
    }
    out.push({ cells: cells.map(([r, c]) => r * n + c), zone: [...zone] });
  };
  for (let r = 0; r < n; r++) for (let c = 0; c + len <= n; c++) add(Array.from({ length: len }, (_, k) => [r, c + k]));
  if (len > 1) for (let c = 0; c < n; c++) for (let r = 0; r + len <= n; r++) add(Array.from({ length: len }, (_, k) => [r + k, c]));
  return out;
}

function placeFleet(n: number, fleet: number[], rng: Rng): boolean[] | null {
  const blocked = new Array<number>(n * n).fill(0);
  const ship = new Array<boolean>(n * n).fill(false);
  const go = (k: number): boolean => {
    if (k === fleet.length) return true;
    for (const p of rng.shuffle(placements(n, must(fleet[k])))) {
      if (p.cells.some((i) => blocked[i])) continue;
      p.cells.forEach((i) => { ship[i] = true; });
      p.zone.forEach((i) => { blocked[i] = must(blocked[i]) + 1; });
      if (go(k + 1)) return true;
      p.cells.forEach((i) => { ship[i] = false; });
      p.zone.forEach((i) => { blocked[i] = must(blocked[i]) - 1; });
    }
    return false;
  };
  return go(0) ? ship : null;
}

type Clues = Pick<FleetPuzzle, "size" | "fleet" | "rows" | "cols" | "revealed">;

/** Aantal verschillende oplossingen (verzamelingen schipvakjes), tot `limit`. */
export function countFleetSolutions(c: Clues, limit = 2): number {
  const n = c.size;
  const byLen = new Map<number, Placement[]>();
  const fits = (p: Placement) => p.cells.every((i) => c.revealed[i] !== "water");
  for (const len of new Set(c.fleet)) byLen.set(len, placements(n, len).filter(fits));
  const rowLeft = c.rows.slice(), colLeft = c.cols.slice();
  const blocked = new Array<number>(n * n).fill(0);
  const ship = new Array<boolean>(n * n).fill(false);
  const found = new Set<string>();
  const mustShip = c.revealed.map((v, i) => (v === "ship" ? i : -1)).filter((i) => i >= 0);
  // Snoeien: elke rij en kolom moet nog genoeg vrije vakjes hebben voor wat er nog in moet.
  const room = () => {
    const rowFree = new Array<number>(n).fill(0), colFree = new Array<number>(n).fill(0);
    for (let i = 0; i < n * n; i++) if (!blocked[i] && c.revealed[i] !== "water") { rowFree[Math.floor(i / n)] = must(rowFree[Math.floor(i / n)]) + 1; colFree[i % n] = must(colFree[i % n]) + 1; }
    for (let k = 0; k < n; k++) if (must(rowLeft[k]) > must(rowFree[k]) || must(colLeft[k]) > must(colFree[k])) return false;
    return mustShip.every((i) => ship[i] || !blocked[i]);
  };
  // Gelijke schepen in vaste volgorde (op index van de plaatsing), anders telt dezelfde oplossing dubbel.
  const go = (k: number, minIndex: number) => {
    if (found.size >= limit) return;
    if (k === c.fleet.length) {
      if (rowLeft.every((v) => v === 0) && colLeft.every((v) => v === 0) && mustShip.every((i) => ship[i])) found.add(ship.map((s) => (s ? 1 : 0)).join(""));
      return;
    }
    const len = must(c.fleet[k]);
    const list = must(byLen.get(len));
    const start = k > 0 && c.fleet[k - 1] === len ? minIndex : 0;
    for (let j = start; j < list.length; j++) {
      const p = must(list[j]);
      if (p.cells.some((i) => blocked[i])) continue;
      let fits = true;
      for (const i of p.cells) {
        const r = Math.floor(i / n), col = i % n;
        rowLeft[r] = must(rowLeft[r]) - 1; colLeft[col] = must(colLeft[col]) - 1;
        if (must(rowLeft[r]) < 0 || must(colLeft[col]) < 0) fits = false;
      }
      if (fits) {
        p.cells.forEach((i) => { ship[i] = true; });
        p.zone.forEach((i) => { blocked[i] = must(blocked[i]) + 1; });
        if (room()) go(k + 1, j + 1);
        p.cells.forEach((i) => { ship[i] = false; });
        p.zone.forEach((i) => { blocked[i] = must(blocked[i]) - 1; });
      }
      for (const i of p.cells) { rowLeft[Math.floor(i / n)] = must(rowLeft[Math.floor(i / n)]) + 1; colLeft[i % n] = must(colLeft[i % n]) + 1; }
      if (found.size >= limit) return;
    }
  };
  go(0, 0);
  return found.size;
}

export function generateFleet(options: FleetOptions): FleetPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const set = FLEET_LEVELS[level];
  const n = set.size;
  for (let attempt = 0; ; attempt++) {
    const rng = createRng(`fleet|${level}|${seed}|${attempt}`);
    const solution = placeFleet(n, set.fleet, rng);
    if (!solution) continue;
    const rows = Array.from({ length: n }, (_, r) => solution.slice(r * n, r * n + n).filter(Boolean).length);
    const cols = Array.from({ length: n }, (_, k) => solution.filter((s, i) => s && i % n === k).length);
    const revealed: FleetPuzzle["revealed"] = solution.map(() => null);
    const clues: Clues = { size: n, fleet: set.fleet, rows, cols, revealed };
    // Open vakjes erbij (eerst schip, dan water) tot er één oplossing is.
    const order = [...rng.shuffle(solution.map((_, i) => i).filter((i) => solution[i])), ...rng.shuffle(solution.map((_, i) => i).filter((i) => !solution[i]))];
    let tries = 0;
    while (countFleetSolutions(clues) > 1 && tries < order.length) {
      const i = must(order[tries++]);
      revealed[i] = solution[i] ? "ship" : "water";
    }
    if (countFleetSolutions(clues) !== 1) continue;
    // Overbodige open vakjes weer dicht, behalve een paar op de makkelijke niveaus.
    for (const i of rng.shuffle(revealed.map((_, i) => i).filter((i) => revealed[i]))) {
      const before = revealed[i] ?? null;
      revealed[i] = null;
      if (countFleetSolutions(clues) !== 1) revealed[i] = before;
    }
    for (const i of rng.shuffle(solution.map((_, i) => i).filter((i) => solution[i] && !revealed[i])).slice(0, set.keep)) revealed[i] = "ship";
    return { size: n, fleet: set.fleet, rows, cols, revealed, solution, level, seed };
  }
}
