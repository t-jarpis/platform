import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Seed } from "./rng.js";
import { must } from "./util.js";

// ---------- Schuifpuzzel ----------

/**
 * Schuifpuzzel: schuif de tegels via het lege vak op volgorde (1, 2, 3 … met het lege vak rechtsonder). De begin-
 * stand komt uit de eindstand met willekeurige schuifjes, dus hij is altijd op te lossen. Eeuwenoud spel.
 */
export interface SlidePuzzle {
  size: number;
  /** Tegel per vak, rij voor rij; `0` = leeg. */
  tiles: number[];
  /** Hoeveel schuifjes er bij het husselen zijn gedaan (een bovengrens voor de kortste oplossing). */
  scrambleMoves: number;
  level: PuzzleLevel;
  seed: Seed;
}

export const SLIDE_LEVELS: Readonly<Record<PuzzleLevel, { size: number; moves: number }>> = {
  starter: { size: 3, moves: 12 },
  "large-print": { size: 3, moves: 20 },
  advanced: { size: 4, moves: 40 },
  expert: { size: 4, moves: 120 },
};

/** De vakken naast het lege vak. */
export function slideNeighbours(size: number, empty: number): number[] {
  const r = Math.floor(empty / size), c = empty % size, out: number[] = [];
  if (r > 0) out.push(empty - size);
  if (r < size - 1) out.push(empty + size);
  if (c > 0) out.push(empty - 1);
  if (c < size - 1) out.push(empty + 1);
  return out;
}

export const isSlideSolved = (tiles: readonly number[]) => tiles.every((t, i) => t === (i === tiles.length - 1 ? 0 : i + 1));

export function generateSlide(options: { seed: Seed; level: PuzzleLevel }): SlidePuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const { size, moves } = SLIDE_LEVELS[level];
  const rng = createRng(`slide|${level}|${seed}`);
  for (;;) {
    const tiles = Array.from({ length: size * size }, (_, i) => (i === size * size - 1 ? 0 : i + 1));
    let empty = size * size - 1, prev = -1;
    for (let k = 0; k < moves; k++) {
      const to = rng.pick(slideNeighbours(size, empty).filter((j) => j !== prev));
      tiles[empty] = must(tiles[to]); tiles[to] = 0;
      prev = empty; empty = to;
    }
    if (!isSlideSolved(tiles)) return { size, tiles, scrambleMoves: moves, level, seed };
  }
}

// ---------- Torens van Hanoi ----------

/**
 * Torens van Hanoi: verplaats de toren van schijven naar een andere stok, één schijf per keer en nooit een grotere
 * op een kleinere. Spel uit de negentiende eeuw. De seed kiest de doelstok (midden of rechts).
 */
export interface HanoiPuzzle {
  discs: number;
  /** Doelstok: 1 (midden) of 2 (rechts); de toren begint links (0). */
  target: 1 | 2;
  /** Kortste oplossing: zetten van stok naar stok. Lengte 2^n − 1. */
  solution: [number, number][];
  level: PuzzleLevel;
  seed: Seed;
}

export const HANOI_LEVELS: Readonly<Record<PuzzleLevel, { discs: number }>> = {
  starter: { discs: 3 },
  "large-print": { discs: 3 },
  advanced: { discs: 4 },
  expert: { discs: 6 },
};

export function generateHanoi(options: { seed: Seed; level: PuzzleLevel }): HanoiPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const { discs } = HANOI_LEVELS[level];
  const target = createRng(`hanoi|${level}|${seed}`).next() < 0.5 ? 1 : 2;
  const solution: [number, number][] = [];
  const move = (k: number, from: number, to: number, via: number) => {
    if (k === 0) return;
    move(k - 1, from, via, to);
    solution.push([from, to]);
    move(k - 1, via, to, from);
  };
  move(discs, 0, target, 3 - target);
  return { discs, target, solution, level, seed };
}

// ---------- Kleurcode raden ----------

/**
 * Kleurcode raden: raad een verborgen rij kleuren. Na elke poging hoor je hoeveel kleuren op de goede plek staan
 * (`exact`) en hoeveel er wel in de code zitten maar op een andere plek (`color`). Eigen naam; niet het merkspel.
 */
export interface ColorCodePuzzle {
  /** Aantal kleuren om uit te kiezen (0 .. colors − 1). */
  colors: number;
  length: number;
  /** Mag een kleur vaker in de code? */
  repeats: boolean;
  maxGuesses: number;
  secret: number[];
  level: PuzzleLevel;
  seed: Seed;
}

export const COLOR_CODE_LEVELS: Readonly<Record<PuzzleLevel, { colors: number; length: number; repeats: boolean; maxGuesses: number }>> = {
  starter: { colors: 4, length: 3, repeats: false, maxGuesses: 8 },
  "large-print": { colors: 5, length: 3, repeats: false, maxGuesses: 8 },
  advanced: { colors: 6, length: 4, repeats: false, maxGuesses: 10 },
  expert: { colors: 6, length: 4, repeats: true, maxGuesses: 10 },
};

/** Score van een poging: kleuren op de goede plek, en goede kleuren op een andere plek. */
export function scoreColorGuess(secret: readonly number[], guess: readonly number[]): { exact: number; color: number } {
  let exact = 0;
  const a = new Map<number, number>(), b = new Map<number, number>();
  secret.forEach((s, i) => {
    const g = must(guess[i]);
    if (s === g) exact++;
    else { a.set(s, (a.get(s) ?? 0) + 1); b.set(g, (b.get(g) ?? 0) + 1); }
  });
  let color = 0;
  for (const [k, v] of a) color += Math.min(v, b.get(k) ?? 0);
  return { exact, color };
}

export function generateColorCode(options: { seed: Seed; level: PuzzleLevel }): ColorCodePuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const set = COLOR_CODE_LEVELS[level];
  const rng = createRng(`color-code|${level}|${seed}`);
  const secret = set.repeats
    ? Array.from({ length: set.length }, () => rng.int(set.colors))
    : rng.shuffle(Array.from({ length: set.colors }, (_, i) => i)).slice(0, set.length);
  return { ...set, secret, level, seed };
}

// ---------- Paren zoeken ----------

/**
 * Paren zoeken: kaartjes liggen omgekeerd; draai er twee om en zoek de paren. De seed kiest welke tekeningen en
 * hun plek. De tekeningen zelf (eigen werk) staan in de site; hier alleen nummers 0 .. pictures − 1.
 */
export interface PairsPuzzle {
  columns: number;
  rows: number;
  /** Tekening per kaartje, rij voor rij; elke tekening komt twee keer voor. */
  cards: number[];
  level: PuzzleLevel;
  seed: Seed;
}

export const PAIRS_LEVELS: Readonly<Record<PuzzleLevel, { columns: number; rows: number }>> = {
  starter: { columns: 4, rows: 3 },
  "large-print": { columns: 4, rows: 3 },
  advanced: { columns: 5, rows: 4 },
  expert: { columns: 6, rows: 5 },
};

export function generatePairs(options: { seed: Seed; level: PuzzleLevel; pictures: number }): PairsPuzzle {
  const { seed, level, pictures } = options;
  assertLevel(level);
  const { columns, rows } = PAIRS_LEVELS[level];
  const pairs = (columns * rows) / 2;
  if (!Number.isInteger(pairs) || pictures < pairs) throw new RangeError(`Te weinig tekeningen: ${pictures} voor ${pairs} paren`);
  const rng = createRng(`pairs|${level}|${seed}`);
  const chosen = rng.shuffle(Array.from({ length: pictures }, (_, i) => i)).slice(0, pairs);
  return { columns, rows, cards: rng.shuffle([...chosen, ...chosen]), level, seed };
}
