import { createRng, type Seed } from "./rng.js";

/**
 * Nonogram: bij elke rij en kolom staan de lengtes van de blokken gevulde vakjes, in volgorde.
 * Een lege rij heeft de aanwijzing `[]` (de site toont meestal "0").
 */
export interface NonogramClues {
  /** Per rij, van boven naar onder; blokken van links naar rechts. */
  rows: number[][];
  /** Per kolom, van links naar rechts; blokken van boven naar onder. */
  columns: number[][];
}

export interface Nonogram extends NonogramClues {
  width: number;
  height: number;
  /** Rij voor rij (`solution[y][x]`), `true` = gevuld. */
  solution: boolean[][];
  /** Aantal keren dat de lijn-oplosser een rij of kolom aanscherpte. Hoger is meer werk. */
  difficulty: { lineSteps: number };
}

/** Toestand van een vakje tijdens het oplossen. */
export type NonogramCell = "filled" | "empty" | "unknown";

export interface NonogramSolve {
  /** Alles gevonden met alleen lijnlogica: precies één oplossing, zonder gokken. */
  solved: boolean;
  /** De aanwijzingen spreken elkaar tegen. */
  contradiction: boolean;
  grid: NonogramCell[][];
  lineSteps: number;
}

const UNKNOWN = -1, EMPTY = 0, FILLED = 1;
const MAX_SIDE = 100;

function assertImage(image: readonly (readonly boolean[])[]): { width: number; height: number } {
  const height = image.length;
  const width = image[0]?.length ?? 0;
  if (height < 1 || width < 1 || height > MAX_SIDE || width > MAX_SIDE) throw new RangeError(`Een nonogram is 1 tot ${MAX_SIDE} vakjes breed en hoog`);
  if (image.some((row) => row.length !== width)) throw new RangeError("Alle rijen moeten even lang zijn");
  return { width, height };
}

function lineClue(line: readonly boolean[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out;
}

/** Maakt de rij- en kolomaanwijzingen bij een pixeltekening (`image[y][x]`, `true` = gevuld). */
export function nonogramClues(image: readonly (readonly boolean[])[]): NonogramClues {
  const { width } = assertImage(image);
  return {
    rows: image.map((row) => lineClue(row)),
    columns: Array.from({ length: width }, (_, x) => lineClue(image.map((row) => row[x] ?? false))),
  };
}

/**
 * Lost één lijn op: welke vakjes zijn in élke plaatsing van de blokken die bij de bekende vakjes
 * past gevuld, of in elke plaatsing leeg? Geeft `null` bij een tegenspraak.
 */
function solveLine(line: Int8Array, clue: readonly number[]): Int8Array | null {
  const n = line.length, k = clue.length;
  // fits[i][j]: vanaf positie i kunnen de blokken j..k-1 nog geplaatst worden.
  const fits: Uint8Array[] = Array.from({ length: n + 2 }, () => new Uint8Array(k + 1));
  // Prefix van gevulde vakjes, om snel te zien of een stuk geen gevuld vakje bevat.
  const filledBefore = new Int32Array(n + 1);
  const emptyBefore = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    filledBefore[i + 1] = (filledBefore[i] ?? 0) + (line[i] === FILLED ? 1 : 0);
    emptyBefore[i + 1] = (emptyBefore[i] ?? 0) + (line[i] === EMPTY ? 1 : 0);
  }
  const noFilled = (a: number, b: number) => (filledBefore[b] ?? 0) - (filledBefore[a] ?? 0) === 0; // [a, b)
  const noEmpty = (a: number, b: number) => (emptyBefore[b] ?? 0) - (emptyBefore[a] ?? 0) === 0;
  const canBlock = (i: number, j: number): boolean => {
    const len = clue[j] ?? 0;
    if (i + len > n || !noEmpty(i, i + len)) return false;
    if (i + len === n) return j === k - 1;
    return line[i + len] !== FILLED;
  };
  for (let i = n + 1; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      const row = fits[i] as Uint8Array;
      if (i >= n) { row[j] = j === k ? 1 : 0; continue; }
      if (j === k) { row[j] = noFilled(i, n) ? 1 : 0; continue; }
      let ok = line[i] !== FILLED && (fits[i + 1]?.[j] ?? 0) === 1;
      if (!ok && canBlock(i, j)) {
        const len = clue[j] ?? 0;
        ok = i + len === n ? true : (fits[i + len + 1]?.[j + 1] ?? 0) === 1;
      }
      row[j] = ok ? 1 : 0;
    }
  }
  if (!fits[0]?.[0]) return null;

  // Vooruit door de bereikbare toestanden en noteer wat elk vakje kan zijn.
  const canFill = new Uint8Array(n), canEmpty = new Uint8Array(n);
  const reach: Uint8Array[] = Array.from({ length: n + 2 }, () => new Uint8Array(k + 1));
  (reach[0] as Uint8Array)[0] = 1;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= k; j++) {
      if (!reach[i]?.[j] || !fits[i]?.[j]) continue;
      if (i >= n) continue;
      if (j === k) { for (let p = i; p < n; p++) canEmpty[p] = 1; continue; }
      if (line[i] !== FILLED && fits[i + 1]?.[j]) { canEmpty[i] = 1; (reach[i + 1] as Uint8Array)[j] = 1; }
      if (canBlock(i, j)) {
        const len = clue[j] ?? 0;
        const next = i + len === n ? n : i + len + 1;
        const nextJ = j + 1;
        if (i + len === n || fits[next]?.[nextJ]) {
          for (let p = i; p < i + len; p++) canFill[p] = 1;
          if (i + len < n) canEmpty[i + len] = 1;
          (reach[next] as Uint8Array)[nextJ] = 1;
        }
      }
    }
  }
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    if (canFill[i] && !canEmpty[i]) out[i] = FILLED;
    else if (canEmpty[i] && !canFill[i]) out[i] = EMPTY;
    else if (!canFill[i] && !canEmpty[i]) return null;
    else out[i] = UNKNOWN;
  }
  return out;
}

/** Lost op met alleen lijnlogica (rij voor rij en kolom voor kolom, tot er niets meer verandert). */
export function solveNonogramLines(clues: NonogramClues): NonogramSolve {
  const height = clues.rows.length, width = clues.columns.length;
  if (height < 1 || width < 1 || height > MAX_SIDE || width > MAX_SIDE) throw new RangeError(`Een nonogram is 1 tot ${MAX_SIDE} vakjes breed en hoog`);
  const grid = new Int8Array(width * height).fill(UNKNOWN);
  let lineSteps = 0;
  let contradiction = false;
  const dirtyRows = new Set([...Array(height).keys()]);
  const dirtyCols = new Set([...Array(width).keys()]);
  while ((dirtyRows.size || dirtyCols.size) && !contradiction) {
    for (const y of [...dirtyRows].sort((a, b) => a - b)) {
      dirtyRows.delete(y);
      const line = grid.slice(y * width, (y + 1) * width);
      const solved = solveLine(line, clues.rows[y] ?? []);
      if (!solved) { contradiction = true; break; }
      let changed = false;
      for (let x = 0; x < width; x++) if (line[x] === UNKNOWN && solved[x] !== UNKNOWN) { grid[y * width + x] = solved[x] ?? UNKNOWN; dirtyCols.add(x); changed = true; }
      if (changed) lineSteps++;
    }
    if (contradiction) break;
    for (const x of [...dirtyCols].sort((a, b) => a - b)) {
      dirtyCols.delete(x);
      const line = Int8Array.from({ length: height }, (_, y) => grid[y * width + x] ?? UNKNOWN);
      const solved = solveLine(line, clues.columns[x] ?? []);
      if (!solved) { contradiction = true; break; }
      let changed = false;
      for (let y = 0; y < height; y++) if (line[y] === UNKNOWN && solved[y] !== UNKNOWN) { grid[y * width + x] = solved[y] ?? UNKNOWN; dirtyRows.add(y); changed = true; }
      if (changed) lineSteps++;
    }
  }
  const cell = (v: number): NonogramCell => (v === FILLED ? "filled" : v === EMPTY ? "empty" : "unknown");
  const rows = Array.from({ length: height }, (_, y) => Array.from(grid.slice(y * width, (y + 1) * width), cell));
  return { solved: !contradiction && !grid.includes(UNKNOWN), contradiction, grid: rows, lineSteps };
}

/** True als de tekening uit haar aanwijzingen terug te vinden is met alleen lijnlogica (uniek en zonder gokken). */
export function isLineSolvable(image: readonly (readonly boolean[])[]): boolean {
  assertImage(image);
  return solveNonogramLines(nonogramClues(image)).solved;
}

/** Maakt een nonogram van een eigen pixeltekening. Weigert een tekening die niet zonder gokken op te lossen is (`isLineSolvable`). */
export function createNonogram(image: readonly (readonly boolean[])[]): Nonogram {
  const { width, height } = assertImage(image);
  const clues = nonogramClues(image);
  const solve = solveNonogramLines(clues);
  if (!solve.solved) throw new RangeError("Deze tekening is niet uniek of niet zonder gokken op te lossen");
  return { width, height, ...clues, solution: image.map((row) => row.slice()), difficulty: { lineSteps: solve.lineSteps } };
}

export interface RandomNonogramOptions {
  seed: Seed;
  width: number;
  height: number;
  /** Kans op een gevuld vakje, groter dan 0 en kleiner dan 1. Standaard 0,55. */
  density?: number;
}

const RANDOM_ATTEMPTS = 2000;

/** Maakt een willekeurig nonogram en probeert opnieuw tot het zonder gokken op te lossen is. */
export function generateRandomNonogram(options: RandomNonogramOptions): Nonogram & { seed: Seed } {
  const { seed, width, height } = options;
  const density = options.density ?? 0.55;
  if (!(density > 0 && density < 1)) throw new RangeError("density moet tussen 0 en 1 liggen");
  if (![width, height].every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_SIDE)) throw new RangeError(`Breedte en hoogte: 1 tot ${MAX_SIDE}`);
  const rng = createRng(`nonogram|${width}x${height}|${density}|${String(seed)}`);
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt++) {
    const image = Array.from({ length: height }, () => Array.from({ length: width }, () => rng.next() < density));
    if (isLineSolvable(image)) return { ...createNonogram(image), seed };
  }
  throw new Error("Geen oplosbaar nonogram gevonden; probeer een hogere density");
}

export interface NonogramCheck {
  /** Rijen en kolommen waarvan de ingevulde blokken niet bij de aanwijzing passen. */
  wrongRows: number[];
  wrongColumns: number[];
  /** Alle rijen en kolommen kloppen. Omdat de puzzel één oplossing heeft, is dit dé oplossing. */
  solved: boolean;
}

/** Controleert het rooster van een speler (`true` = gevuld) tegen de aanwijzingen. */
export function checkNonogram(clues: NonogramClues, grid: readonly (readonly boolean[])[]): NonogramCheck {
  const { width, height } = assertImage(grid);
  if (height !== clues.rows.length || width !== clues.columns.length) throw new RangeError("Rooster en aanwijzingen hebben een ander formaat");
  const mine = nonogramClues(grid);
  const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  const wrongRows = mine.rows.flatMap((r, y) => (same(r, clues.rows[y] ?? []) ? [] : [y]));
  const wrongColumns = mine.columns.flatMap((c, x) => (same(c, clues.columns[x] ?? []) ? [] : [x]));
  return { wrongRows, wrongColumns, solved: wrongRows.length === 0 && wrongColumns.length === 0 };
}
