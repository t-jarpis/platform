import { assertLevel, type PuzzleLevel } from "./level.js";
import type { Point } from "./maze.js";
import { createRng, type Rng, type Seed } from "./rng.js";

/** Leesrichting van een woord, als windrichting: `E` is van links naar rechts, `W` achterstevoren. */
export type WordDirection = "E" | "S" | "SE" | "NE" | "W" | "N" | "NW" | "SW";

export const WORD_DIRECTIONS: readonly WordDirection[] = ["E", "S", "SE", "NE", "W", "N", "NW", "SW"];

/** Richtingen die je "vooruit" leest (links naar rechts of boven naar onder). De rest is achterstevoren. */
export const FORWARD_DIRECTIONS: readonly WordDirection[] = ["E", "S", "SE", "NE"];

const VECTORS: Readonly<Record<WordDirection, readonly [number, number]>> = {
  E: [1, 0], S: [0, 1], SE: [1, 1], NE: [1, -1], W: [-1, 0], N: [0, -1], NW: [-1, -1], SW: [-1, 1],
};

export const DEFAULT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Standaardinstellingen per niveau. `size` is de minimale zijde; een langer woord maakt het rooster groter. */
export const WORD_SEARCH_LEVELS: Readonly<Record<PuzzleLevel, { size: number; directions: readonly WordDirection[] }>> = {
  starter: { size: 8, directions: ["E", "S"] },
  advanced: { size: 12, directions: ["E", "S", "SE", "NE"] },
  expert: { size: 15, directions: WORD_DIRECTIONS },
  "large-print": { size: 8, directions: ["E", "S"] },
};

export interface WordSearchOptions {
  seed: Seed;
  level: PuzzleLevel;
  /** De woorden (de site levert de lijst). Hoofdletters, spaties, streepjes, punten en apostroffen worden weggehaald. */
  words: readonly string[];
  /** Zijde van een vierkant rooster, of breedte en hoogte. Standaard: zie `WORD_SEARCH_LEVELS`; groeit mee als de woorden niet passen. */
  size?: number | { width: number; height: number };
  /** Toegestane richtingen; standaard die van het niveau. */
  directions?: readonly WordDirection[];
  /** Letters voor de vulvakjes (en toegestane letters in woorden). Standaard A–Z. */
  alphabet?: string | readonly string[];
}

export interface WordPlacement {
  /** Het woord zoals het in het rooster staat (genormaliseerd). */
  word: string;
  /** Het woord zoals de site het aanleverde. */
  input: string;
  start: Point;
  end: Point;
  direction: WordDirection;
}

export interface WordSearch {
  width: number;
  height: number;
  /** Rij voor rij (index = y * width + x), één letter per vakje. */
  grid: string[];
  /** Plaatsingen in de volgorde van `options.words`: de oplossing. */
  placements: WordPlacement[];
  directions: WordDirection[];
  alphabet: string[];
  level: PuzzleLevel;
  seed: Seed;
}

export type WordSearchFind = { found: true; word: string; index: number } | { found: false };

const ATTEMPTS = 30;
const STEP_BUDGET = 20_000;
const MAX_GROWTH = 6;

/** Haalt spaties, streepjes, punten en apostroffen weg en maakt hoofdletters. */
export function normalizeWord(word: string): string {
  return word.replace(/[\s\-'’.]/gu, "").toUpperCase();
}

const reverse = (word: string) => [...word].reverse().join("");

/**
 * Maakt een woordzoeker. Elk woord staat er precies één keer in (in welke richting dan ook, ook
 * buiten de toegestane richtingen); vulletters vormen nooit per ongeluk een extra exemplaar.
 * Deterministisch: dezelfde opties geven hetzelfde rooster.
 */
export function generateWordSearch(options: WordSearchOptions): WordSearch {
  const { seed, level } = options;
  assertLevel(level);
  const settings = WORD_SEARCH_LEVELS[level];
  const directions = [...(options.directions ?? settings.directions)];
  if (directions.length === 0 || directions.some((d) => !WORD_DIRECTIONS.includes(d))) throw new RangeError("Ongeldige richtingen");
  const alphabet = [...new Set([...(typeof options.alphabet === "string" ? [...options.alphabet] : options.alphabet ?? [...DEFAULT_ALPHABET])].map((l) => l.toUpperCase()))];
  if (alphabet.length < 2) throw new RangeError("Het alfabet heeft minstens twee letters nodig");
  const words = prepareWords(options.words, alphabet);
  const longest = Math.max(...words.map((w) => w.letters.length));

  let width: number, height: number;
  const fixed = options.size !== undefined;
  if (typeof options.size === "number") width = height = options.size;
  else if (options.size) ({ width, height } = options.size);
  else width = height = Math.max(settings.size, longest);
  if (![width, height].every((n) => Number.isInteger(n) && n >= 2 && n <= 50)) throw new RangeError("Breedte en hoogte moeten tussen 2 en 50 liggen");

  const rng = createRng(`wordsearch|${level}|${width}x${height}|${fixed ? "fixed" : "auto"}|${directions.join(",")}|${alphabet.join("")}|${words.map((w) => w.word).join(",")}|${String(seed)}`);
  for (let growth = 0; growth <= (fixed ? 0 : MAX_GROWTH); growth++) {
    const w = width + growth, h = height + growth;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const result = attemptBuild(words, w, h, directions, alphabet, rng);
      if (result) {
        return { width: w, height: h, grid: result.grid, placements: result.placements, directions, alphabet, level, seed };
      }
    }
  }
  throw new RangeError("De woorden passen niet in het rooster");
}

interface PreparedWord {
  input: string;
  word: string;
  letters: string[];
}

function prepareWords(input: readonly string[], alphabet: readonly string[]): PreparedWord[] {
  if (input.length === 0) throw new RangeError("Geef minstens één woord");
  const allowed = new Set(alphabet);
  const words = input.map((raw) => {
    const word = normalizeWord(raw);
    const letters = [...word];
    if (letters.length < 2) throw new RangeError(`Woord "${raw}" is te kort (minstens twee letters)`);
    const bad = letters.find((l) => !allowed.has(l));
    if (bad) throw new RangeError(`Woord "${raw}" bevat "${bad}", dat niet in het alfabet zit`);
    return { input: raw, word, letters };
  });
  for (const a of words) {
    for (const b of words) {
      if (a === b) continue;
      if (a.word === b.word) throw new RangeError(`Woord "${a.input}" staat dubbel in de lijst`);
      // Een woord in (het omgekeerde van) een ander woord zou altijd twee keer te vinden zijn.
      if (b.word.includes(a.word) || reverse(b.word).includes(a.word)) {
        throw new RangeError(`Woord "${a.input}" zit in "${b.input}" en zou dan dubbel te vinden zijn`);
      }
    }
  }
  return words;
}

interface Built {
  grid: string[];
  placements: WordPlacement[];
}

function attemptBuild(words: readonly PreparedWord[], width: number, height: number, directions: readonly WordDirection[], alphabet: readonly string[], rng: Rng): Built | null {
  const cells: (string | null)[] = new Array<string | null>(width * height).fill(null);
  const order = words.map((_, i) => i).sort((a, b) => (words[b]?.letters.length ?? 0) - (words[a]?.letters.length ?? 0) || a - b);
  const chosen: { x: number; y: number; d: WordDirection }[] = new Array(words.length);
  let budget = STEP_BUDGET;

  const fits = (letters: readonly string[], x: number, y: number, d: WordDirection): boolean => {
    const [dx, dy] = VECTORS[d];
    const ex = x + dx * (letters.length - 1), ey = y + dy * (letters.length - 1);
    if (ex < 0 || ey < 0 || ex >= width || ey >= height) return false;
    for (let k = 0; k < letters.length; k++) {
      const c = cells[(y + dy * k) * width + (x + dx * k)];
      if (c !== null && c !== letters[k]) return false;
    }
    return true;
  };

  const place = (k: number): boolean => {
    if (k === order.length) return true;
    const wi = order[k] ?? 0;
    const letters = words[wi]?.letters ?? [];
    const options: { x: number; y: number; d: WordDirection }[] = [];
    for (const d of directions) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (fits(letters, x, y, d)) options.push({ x, y, d });
    for (const o of rng.shuffle(options)) {
      if (--budget < 0) return false;
      const [dx, dy] = VECTORS[o.d];
      const written: number[] = [];
      letters.forEach((l, j) => {
        const i = (o.y + dy * j) * width + (o.x + dx * j);
        if (cells[i] === null) { cells[i] = l; written.push(i); }
      });
      chosen[wi] = o;
      if (place(k + 1)) return true;
      for (const i of written) cells[i] = null;
    }
    return false;
  };
  if (!place(0)) return null;

  const placements: WordPlacement[] = words.map((w, i) => {
    const o = chosen[i] as { x: number; y: number; d: WordDirection };
    const [dx, dy] = VECTORS[o.d];
    const n = w.letters.length - 1;
    return { word: w.word, input: w.input, start: { x: o.x, y: o.y }, end: { x: o.x + dx * n, y: o.y + dy * n }, direction: o.d };
  });
  const fill = new Set<number>();
  for (let i = 0; i < cells.length; i++) if (cells[i] === null) { fill.add(i); cells[i] = rng.pick(alphabet); }
  const grid = cells as string[];

  // Vulletters bijsturen tot geen woord nog een tweede keer voorkomt.
  for (let round = 0; round < 500; round++) {
    const extra = extraOccurrences(grid, width, height, words, placements);
    if (extra.length === 0) return { grid, placements };
    for (const occurrence of extra) {
      const free = occurrence.filter((i) => fill.has(i));
      if (free.length === 0) return null; // extra exemplaar uit alleen geplaatste letters: opnieuw
      const i = rng.pick(free);
      const current = grid[i];
      grid[i] = rng.pick(alphabet.filter((l) => l !== current));
    }
  }
  return null;
}

/** Vakjes van elk voorkomen van `letters`, in alle acht richtingen (een palindroom telt één keer). */
function occurrences(grid: readonly string[], width: number, height: number, letters: readonly string[]): number[][] {
  const found = new Map<string, number[]>();
  const n = letters.length - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x] !== letters[0]) continue;
      for (const d of WORD_DIRECTIONS) {
        const [dx, dy] = VECTORS[d];
        const ex = x + dx * n, ey = y + dy * n;
        if (ex < 0 || ey < 0 || ex >= width || ey >= height) continue;
        const path: number[] = [];
        let ok = true;
        for (let k = 0; k <= n && ok; k++) {
          const i = (y + dy * k) * width + (x + dx * k);
          ok = grid[i] === letters[k];
          path.push(i);
        }
        if (ok) found.set(pathKey(path), path);
      }
    }
  }
  return [...found.values()];
}

const pathKey = (path: readonly number[]) => {
  const a = path[0] ?? 0, b = path[path.length - 1] ?? 0;
  return a < b ? `${a}-${b}` : `${b}-${a}`;
};

function placementPath(p: WordPlacement, width: number): number[] {
  const [dx, dy] = VECTORS[p.direction];
  return [...p.word].map((_, k) => (p.start.y + dy * k) * width + (p.start.x + dx * k));
}

function extraOccurrences(grid: readonly string[], width: number, height: number, words: readonly PreparedWord[], placements: readonly WordPlacement[]): number[][] {
  const extra: number[][] = [];
  words.forEach((w, i) => {
    const own = pathKey(placementPath(placements[i] as WordPlacement, width));
    for (const path of occurrences(grid, width, height, w.letters)) if (pathKey(path) !== own) extra.push(path);
  });
  return extra;
}

/** Hoe vaak elk woord in het rooster voorkomt, in alle acht richtingen. Voor een gegenereerde puzzel altijd 1. */
export function countWordOccurrences(puzzle: Pick<WordSearch, "grid" | "width" | "height" | "placements">): number[] {
  return puzzle.placements.map((p) => occurrences(puzzle.grid, puzzle.width, puzzle.height, [...p.word]).length);
}

/**
 * Controleert een gevonden woord: de speler sleept van `from` naar `to` (of andersom).
 * Geeft het gevonden woord en zijn index in `placements`.
 */
export function checkWordSearchFind(puzzle: Pick<WordSearch, "placements">, from: Point, to: Point): WordSearchFind {
  const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
  const index = puzzle.placements.findIndex((p) => (same(p.start, from) && same(p.end, to)) || (same(p.start, to) && same(p.end, from)));
  const hit = puzzle.placements[index];
  return hit ? { found: true, word: hit.word, index } : { found: false };
}
