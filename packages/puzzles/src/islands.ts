import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Rng, type Seed } from "./rng.js";
import { must } from "./util.js";

/**
 * Zee en eilanden: maak vakjes zee zodat
 * - elk getal in een eiland ligt met precies zoveel vakjes, met één getal per eiland,
 * - alle zee één geheel is (recht aan elkaar),
 * - nergens een blok van 2×2 zee ligt.
 * Eigen generator en eigen naam.
 */
export interface IslandsPuzzle {
  size: number;
  /** Getal op een vakje, of `null`. */
  clues: (number | null)[];
  /** `true` = land. */
  solution: boolean[];
  level: PuzzleLevel;
  seed: Seed;
}

interface IslandsSettings { size: number; maxIsland: number }

export const ISLANDS_LEVELS: Readonly<Record<PuzzleLevel, IslandsSettings>> = {
  starter: { size: 5, maxIsland: 3 },
  "large-print": { size: 5, maxIsland: 4 },
  advanced: { size: 6, maxIsland: 5 },
  expert: { size: 7, maxIsland: 6 },
};

export interface IslandsOptions { seed: Seed; level: PuzzleLevel }

function nb(n: number, i: number): number[] {
  const r = Math.floor(i / n), c = i % n, out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

const SEA = 0, LAND = 1, OPEN = -1;

/** Geldt alles voor een volledig rooster? (land/zee) */
export function islandsValid(n: number, clues: readonly (number | null)[], land: readonly boolean[]): boolean {
  const seen = new Array<boolean>(n * n).fill(false);
  for (let i = 0; i < n * n; i++) {
    if (!land[i] || seen[i]) continue;
    const comp: number[] = [i];
    seen[i] = true;
    for (let k = 0; k < comp.length; k++) for (const j of nb(n, must(comp[k]))) if (land[j] && !seen[j]) { seen[j] = true; comp.push(j); }
    const nums = comp.map((j) => clues[j]).filter((v): v is number => v != null);
    if (nums.length !== 1 || nums[0] !== comp.length) return false;
  }
  for (let i = 0; i < n * n; i++) if (clues[i] != null && !land[i]) return false;
  const sea = land.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0);
  if (!sea.length) return false;
  const s = new Set([must(sea[0])]), stack = [must(sea[0])];
  while (stack.length) for (const j of nb(n, must(stack.pop()))) if (!land[j] && !s.has(j)) { s.add(j); stack.push(j); }
  if (s.size !== sea.length) return false;
  for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) {
    const i = r * n + c;
    if (!land[i] && !land[i + 1] && !land[i + n] && !land[i + n + 1]) return false;
  }
  return true;
}

/**
 * Aantal oplossingen, tot `limit`; `null` als het te lang duurt. Vakje voor vakje land of zee, met snoeien op:
 * eilanden te groot of met twee getallen, land dat geen getal meer kan halen, 2×2 zee, en zee die niet meer
 * samen kan komen.
 */
export function countIslandsSolutions(n: number, clues: readonly (number | null)[], limit = 2, budget = 300_000): number | null {
  const N = n * n;
  const cell: number[] = clues.map((v) => (v != null ? LAND : OPEN));
  const total = clues.reduce<number>((s, v) => s + (v ?? 0), 0);
  let count = 0, steps = 0;
  const comp = (i: number, pass: (v: number) => boolean) => {
    const out = [i], seen = new Set([i]);
    for (let k = 0; k < out.length; k++) for (const j of nb(n, must(out[k]))) if (!seen.has(j) && pass(must(cell[j]))) { seen.add(j); out.push(j); }
    return out;
  };
  const okIsland = (i: number) => {
    const land = comp(i, (v) => v === LAND);
    const nums = land.map((j) => clues[j]).filter((v): v is number => v != null);
    if (nums.length > 1) return false;
    if (nums.length === 1 && land.length > must(nums[0])) return false;
    if (nums.length === 0) {
      // Moet nog een getal kunnen bereiken via open vakjes, binnen de grootte daarvan.
      const reach = comp(i, (v) => v !== SEA);
      if (!reach.some((j) => clues[j] != null)) return false;
    } else if (land.length < must(nums[0])) {
      const reach = comp(i, (v) => v !== SEA);
      if (reach.filter((j) => cell[j] !== SEA).length < must(nums[0])) return false;
    }
    return true;
  };
  const okSea = (i: number) => {
    const r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr + 1 >= n || cc + 1 >= n) continue;
      const j = rr * n + cc;
      if ([j, j + 1, j + n, j + n + 1].every((k) => cell[k] === SEA)) return false;
    }
    // Alle zee moet samen kunnen komen via open vakjes.
    const reach = comp(i, (v) => v !== LAND);
    const seaCount = cell.filter((v) => v === SEA).length;
    return reach.filter((j) => cell[j] === SEA).length === seaCount;
  };
  const go = (i: number): boolean => {
    if (++steps > budget) return false;
    if (i === N) {
      if (islandsValid(n, clues, cell.map((v) => v === LAND))) count++;
      return count < limit;
    }
    if (cell[i] !== OPEN) return go(i + 1);
    const landNow = cell.filter((v) => v === LAND).length;
    for (const v of [SEA, LAND]) {
      if (v === LAND && landNow >= total) continue;
      cell[i] = v;
      const fine = v === SEA ? okSea(i) && nb(n, i).every((j) => cell[j] !== LAND || okIsland(j)) : okIsland(i);
      if (fine && !go(i + 1)) { cell[i] = OPEN; return false; }
      cell[i] = OPEN;
    }
    return true;
  };
  const finished = go(0);
  if (!finished && steps > budget) return null;
  return count;
}

function build(n: number, maxIsland: number, rng: Rng): boolean[] | null {
  const land = new Array<boolean>(n * n).fill(false);
  const owner = new Array<number>(n * n).fill(-1);
  const touchesOther = (i: number, id: number) => nb(n, i).some((j) => owner[j] !== -1 && owner[j] !== id);
  const seaConnected = () => {
    const sea = land.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0);
    if (!sea.length) return false;
    const s = new Set([must(sea[0])]), st = [must(sea[0])];
    while (st.length) for (const j of nb(n, must(st.pop()))) if (!land[j] && !s.has(j)) { s.add(j); st.push(j); }
    return s.size === sea.length;
  };
  const pools = () => {
    const out: number[] = [];
    for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) {
      const i = r * n + c;
      if (!land[i] && !land[i + 1] && !land[i + n] && !land[i + n + 1]) out.push(i);
    }
    return out;
  };
  let id = 0;
  for (let guard = 0; guard < 200; guard++) {
    const open = pools();
    if (!open.length) return land;
    const p = rng.pick(open);
    const cells = rng.shuffle([p, p + 1, p + n, p + n + 1]);
    // Een bestaand eiland laten groeien in de poel, of een nieuw eiland beginnen.
    let placed = false;
    for (const c of cells) {
      const owners = new Set(nb(n, c).map((j) => owner[j]).filter((o) => o !== -1));
      if (owners.size > 1) continue;
      const own = owners.size ? must([...owners][0]) : id;
      if (owners.size && owner.filter((o) => o === own).length >= maxIsland) continue;
      if (!owners.size && touchesOther(c, own)) continue;
      land[c] = true; owner[c] = own;
      if (seaConnected()) { placed = true; if (!owners.size) id++; break; }
      land[c] = false; owner[c] = -1;
    }
    if (!placed) return null;
  }
  return null;
}

export function generateIslands(options: IslandsOptions): IslandsPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const { size: n, maxIsland } = ISLANDS_LEVELS[level];
  for (let attempt = 0; attempt < 500; attempt++) {
    const rng = createRng(`islands|${level}|${seed}|${attempt}`);
    const land = build(n, maxIsland, rng);
    if (!land) continue;
    // Een paar losse eilandjes erbij (of eilanden laten groeien) maakt het minder leeg; alleen als het geldig blijft.
    const clues: (number | null)[] = land.map(() => null);
    const seen = new Array<boolean>(n * n).fill(false);
    for (let i = 0; i < n * n; i++) {
      if (!land[i] || seen[i]) continue;
      const comp = [i];
      seen[i] = true;
      for (let k = 0; k < comp.length; k++) for (const j of nb(n, must(comp[k]))) if (land[j] && !seen[j]) { seen[j] = true; comp.push(j); }
      clues[rng.pick(comp)] = comp.length;
    }
    if (!islandsValid(n, clues, land)) continue;
    if (countIslandsSolutions(n, clues) !== 1) continue;
    return { size: n, clues, solution: land, level, seed };
  }
  throw new Error("Geen eilandenpuzzel met één oplossing gevonden");
}
