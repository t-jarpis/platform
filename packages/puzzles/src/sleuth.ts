import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Rng, type Seed } from "./rng.js";

/**
 * Speurpuzzel: een logische plaatsingspuzzel. Een vierkant rooster is verdeeld in kamers, sommige
 * vakjes zijn bezet (obstakel), sommige randvakjes hebben een raam. Er staan een aantal figuren in
 * het rooster: nooit twee in dezelfde rij of kolom (zoals torens) en nooit op een obstakel. Met de
 * aanwijzingen is precies één opstelling mogelijk. De vraag is welke figuur in een bepaalde kamer staat.
 *
 * Figuren, kamers, rijen en kolommen zijn nummers vanaf 0; de site kiest namen en formuleert de tekst.
 */

/** Eigenschap van een vakje: `edge` = aan de buitenrand, `window` = bij een raam. */
export type SleuthFeature = "edge" | "window";

export type SleuthClue =
  | { type: "in-room"; figure: number; room: number }
  | { type: "not-in-room"; figure: number; room: number }
  | { type: "in-row"; figure: number; row: number }
  | { type: "in-column"; figure: number; column: number }
  /** De twee figuren raken elkaar (ook schuin). Omdat figuren nooit in dezelfde rij of kolom staan, is dat altijd schuin. */
  | { type: "touching"; figure: number; other: number }
  /** `figure` staat in een kolom links van `other` (niet per se ernaast). */
  | { type: "left-of"; figure: number; other: number }
  /** `figure` staat in een rij boven `other` (niet per se erboven). */
  | { type: "above"; figure: number; other: number }
  | { type: "on-feature"; figure: number; feature: SleuthFeature }
  | { type: "not-on-feature"; figure: number; feature: SleuthFeature };

export type SleuthClueType = SleuthClue["type"];

export const SLEUTH_CLUE_TYPES: readonly SleuthClueType[] = ["in-room", "not-in-room", "in-row", "in-column", "touching", "left-of", "above", "on-feature", "not-on-feature"];

/** Wat de oplosser nodig heeft. */
export interface SleuthLayout {
  /** Zijde van het rooster; vakje-index = y * size + x. */
  size: number;
  figureCount: number;
  /** Kamer per vakje, rij voor rij. Kamers zijn genummerd in leesvolgorde van hun eerste vakje. */
  rooms: number[];
  /** Vakjes waar geen figuur kan staan. */
  obstacles: number[];
  /** Randvakjes met een raam. */
  windows: number[];
  clues: SleuthClue[];
}

export interface SleuthPuzzle extends SleuthLayout {
  roomCount: number;
  /** "Wie staat in kamer `room`?" Precies één figuur staat in die kamer. */
  question: { room: number };
  answer: { figure: number };
  /** Vakje per figuur. */
  solution: number[];
  level: PuzzleLevel;
  seed: Seed;
}

export interface SleuthOptions {
  seed: Seed;
  level: PuzzleLevel;
}

interface LevelSettings {
  size: number;
  figures: readonly [number, number];
  rooms: number;
  obstacles: number;
  windows: number;
  /** Toegestane aanwijzingen, in volgorde van voorkeur (eerst geprobeerd, als laatste weggehaald). */
  tiers: readonly (readonly SleuthClueType[])[];
}

export const SLEUTH_LEVELS: Readonly<Record<PuzzleLevel, LevelSettings>> = {
  starter: { size: 4, figures: [3, 3], rooms: 4, obstacles: 2, windows: 2, tiers: [["in-room", "not-in-room"], ["in-row", "in-column"]] },
  "large-print": { size: 5, figures: [4, 4], rooms: 5, obstacles: 3, windows: 2, tiers: [["in-room", "not-in-room"], ["in-row", "in-column"]] },
  advanced: { size: 6, figures: [5, 5], rooms: 6, obstacles: 4, windows: 3, tiers: [["not-in-room", "touching", "left-of", "above", "on-feature"], ["in-room"], ["in-row", "in-column"]] },
  expert: { size: 8, figures: [7, 8], rooms: 8, obstacles: 6, windows: 4, tiers: [["not-in-room", "touching", "left-of", "above", "on-feature", "not-on-feature"], ["in-room"], ["in-row", "in-column"]] },
};

const ATTEMPTS = 20;

/**
 * Maakt een speurpuzzel met precies één oplossing. Eerst een geldige opstelling, dan aanwijzingen
 * erbij tot de oplosser nog één opstelling telt, daarna overbodige aanwijzingen weg. Er komt nooit
 * een `in-room`-aanwijzing over de vraagkamer.
 */
export function generateSleuth(options: SleuthOptions): SleuthPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const s = SLEUTH_LEVELS[level];
  const rng = createRng(`sleuth|${level}|${String(seed)}`);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const figureCount = s.figures[0] + rng.int(s.figures[1] - s.figures[0] + 1);
    const puzzle = attemptSleuth(s, figureCount, rng);
    if (puzzle) return { ...puzzle, level, seed };
  }
  throw new Error("Kon geen speurpuzzel maken");
}

function attemptSleuth(s: LevelSettings, figureCount: number, rng: Rng): Omit<SleuthPuzzle, "level" | "seed"> | null {
  const { size } = s;
  const rooms = growRooms(size, s.rooms, rng);
  const rows = rng.shuffle([...Array(size).keys()]).slice(0, figureCount);
  const cols = rng.shuffle([...Array(size).keys()]).slice(0, figureCount);
  const solution = rows.map((r, f) => r * size + (cols[f] ?? 0));
  const taken = new Set(solution);
  const obstacles = rng.shuffle([...Array(size * size).keys()].filter((i) => !taken.has(i))).slice(0, s.obstacles).sort((a, b) => a - b);
  const blocked = new Set(obstacles);
  const border = [...Array(size * size).keys()].filter((i) => isEdge(i, size) && !blocked.has(i));
  const windows = rng.shuffle(border).slice(0, s.windows).sort((a, b) => a - b);

  const perRoom = new Map<number, number[]>();
  solution.forEach((cell, f) => { const r = rooms[cell] ?? 0; perRoom.set(r, [...(perRoom.get(r) ?? []), f]); });
  const single = [...perRoom.entries()].filter(([, fs]) => fs.length === 1).map(([r]) => r).sort((a, b) => a - b);
  if (single.length === 0) return null;
  const questionRoom = rng.pick(single);
  const answer = perRoom.get(questionRoom)?.[0] ?? 0;

  const layout: SleuthLayout = { size, figureCount, rooms, obstacles, windows, clues: [] };
  const allowed = s.tiers.flat();
  const tierOf = (c: SleuthClue) => s.tiers.findIndex((t) => t.includes(c.type));
  const candidates = trueClues(layout, solution).filter((c) => allowed.includes(c.type) && !(c.type === "in-room" && c.room === questionRoom));
  const ordered = rng.shuffle(candidates).sort((a, b) => tierOf(a) - tierOf(b));

  const clues: SleuthClue[] = [];
  for (const c of ordered) {
    clues.push(c);
    if (countSleuthSolutions({ ...layout, clues }, 2) === 1) break;
  }
  if (countSleuthSolutions({ ...layout, clues }, 2) !== 1) return null;

  // Overbodige aanwijzingen weg; de sterkste (laatste niveau) eerst.
  const removal = rng.shuffle(clues).sort((a, b) => tierOf(b) - tierOf(a));
  let kept = clues.slice();
  for (const c of removal) {
    const without = kept.filter((k) => k !== c);
    if (countSleuthSolutions({ ...layout, clues: without }, 2) === 1) kept = without;
  }
  // Volgorde voor de lezer: eerst per type (vaste volgorde), dan willekeurig binnen het type.
  const final = rng.shuffle(kept).sort((a, b) => SLEUTH_CLUE_TYPES.indexOf(a.type) - SLEUTH_CLUE_TYPES.indexOf(b.type));
  return { ...layout, clues: final, roomCount: s.rooms, question: { room: questionRoom }, answer: { figure: answer }, solution };
}

/** Verdeelt het rooster in `count` samenhangende kamers door ze tegelijk te laten groeien. */
function growRooms(size: number, count: number, rng: Rng): number[] {
  const cells = size * size;
  const room = new Array<number>(cells).fill(-1);
  const seeds = rng.shuffle([...Array(cells).keys()]).slice(0, count);
  seeds.forEach((c, r) => { room[c] = r; });
  const sizes = new Array<number>(count).fill(1);
  let left = cells - count;
  while (left > 0) {
    // De kleinste kamer met ruimte groeit; zo blijven kamers ongeveer even groot.
    const growable = [...Array(count).keys()].filter((r) => frontier(room, size, r).length > 0);
    const smallest = Math.min(...growable.map((r) => sizes[r] ?? 0));
    const r = rng.pick(growable.filter((g) => sizes[g] === smallest));
    const c = rng.pick(frontier(room, size, r));
    room[c] = r;
    sizes[r] = (sizes[r] ?? 0) + 1;
    left--;
  }
  // Hernummeren in leesvolgorde.
  const map = new Map<number, number>();
  return room.map((r) => { if (!map.has(r)) map.set(r, map.size); return map.get(r) ?? 0; });
}

function frontier(room: readonly number[], size: number, r: number): number[] {
  const out = new Set<number>();
  for (let i = 0; i < room.length; i++) {
    if (room[i] !== r) continue;
    for (const n of neighbours4(i, size)) if (room[n] === -1) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function neighbours4(i: number, size: number): number[] {
  const x = i % size, y = Math.floor(i / size);
  const out: number[] = [];
  if (y > 0) out.push(i - size);
  if (x < size - 1) out.push(i + 1);
  if (y < size - 1) out.push(i + size);
  if (x > 0) out.push(i - 1);
  return out;
}

const isEdge = (i: number, size: number) => {
  const x = i % size, y = Math.floor(i / size);
  return x === 0 || y === 0 || x === size - 1 || y === size - 1;
};

function hasFeature(layout: Pick<SleuthLayout, "size" | "windows">, cell: number, feature: SleuthFeature): boolean {
  return feature === "edge" ? isEdge(cell, layout.size) : layout.windows.includes(cell);
}

/** Alle aanwijzingen die bij deze opstelling waar zijn. */
function trueClues(layout: SleuthLayout, solution: readonly number[]): SleuthClue[] {
  const { size, rooms } = layout;
  const roomCount = Math.max(...rooms) + 1;
  const out: SleuthClue[] = [];
  solution.forEach((cell, figure) => {
    const room = rooms[cell] ?? 0;
    out.push({ type: "in-room", figure, room });
    for (let r = 0; r < roomCount; r++) if (r !== room) out.push({ type: "not-in-room", figure, room: r });
    out.push({ type: "in-row", figure, row: Math.floor(cell / size) });
    out.push({ type: "in-column", figure, column: cell % size });
    for (const feature of ["edge", "window"] as const) {
      out.push(hasFeature(layout, cell, feature) ? { type: "on-feature", figure, feature } : { type: "not-on-feature", figure, feature });
    }
    solution.forEach((other, o) => {
      if (o === figure) return;
      if (o > figure && touching(cell, other, size)) out.push({ type: "touching", figure, other: o });
      if (cell % size < other % size) out.push({ type: "left-of", figure, other: o });
      if (cell < other && Math.floor(cell / size) < Math.floor(other / size)) out.push({ type: "above", figure, other: o });
    });
  });
  return out;
}

const touching = (a: number, b: number, size: number) =>
  a !== b && Math.abs((a % size) - (b % size)) <= 1 && Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1;

/** Waar voor één figuur op `cell`? (alleen aanwijzingen over één figuur) */
function unaryHolds(layout: SleuthLayout, clue: SleuthClue, cell: number): boolean {
  const { size, rooms } = layout;
  switch (clue.type) {
    case "in-room": return rooms[cell] === clue.room;
    case "not-in-room": return rooms[cell] !== clue.room;
    case "in-row": return Math.floor(cell / size) === clue.row;
    case "in-column": return cell % size === clue.column;
    case "on-feature": return hasFeature(layout, cell, clue.feature);
    case "not-on-feature": return !hasFeature(layout, cell, clue.feature);
    default: return true;
  }
}

/** Waar voor `figure` op `a` en `other` op `b`? (alleen aanwijzingen over twee figuren) */
function binaryHolds(clue: SleuthClue, a: number, b: number, size: number): boolean {
  switch (clue.type) {
    case "touching": return touching(a, b, size);
    case "left-of": return a % size < b % size;
    case "above": return Math.floor(a / size) < Math.floor(b / size);
    default: return true;
  }
}

const isBinary = (c: SleuthClue): c is Extract<SleuthClue, { other: number }> => "other" in c;

function assertLayout(layout: SleuthLayout): void {
  const { size, figureCount, rooms } = layout;
  if (!Number.isInteger(size) || size < 2 || size > 12) throw new RangeError("Zijde moet tussen 2 en 12 liggen");
  if (!Number.isInteger(figureCount) || figureCount < 1 || figureCount > size) throw new RangeError("Ongeldig aantal figuren");
  if (rooms.length !== size * size) throw new RangeError("rooms heeft niet size × size vakjes");
}

/** Telt opstellingen die aan alle regels en aanwijzingen voldoen, tot `limit`. */
export function countSleuthSolutions(layout: SleuthLayout, limit = 2): number {
  let count = 0;
  search(layout, () => ++count >= limit);
  return count;
}

/** De enige (of eerste gevonden) opstelling: vakje per figuur, of `null`. */
export function solveSleuth(layout: SleuthLayout): number[] | null {
  let found: number[] | null = null;
  search(layout, (cells) => { found = cells.slice(); return true; });
  return found;
}

/** Backtracking: telkens de figuur met de minste mogelijke vakjes. `visit` geeft true om te stoppen. */
function search(layout: SleuthLayout, visit: (cells: readonly number[]) => boolean): void {
  assertLayout(layout);
  const { size, figureCount, clues } = layout;
  const blocked = new Set(layout.obstacles);
  const domains: number[][] = [];
  for (let f = 0; f < figureCount; f++) {
    const unary = clues.filter((c) => !isBinary(c) && c.figure === f);
    domains.push([...Array(size * size).keys()].filter((cell) => !blocked.has(cell) && unary.every((c) => unaryHolds(layout, c, cell))));
  }
  const binary = clues.filter(isBinary);
  const cells = new Array<number>(figureCount).fill(-1);
  let rowsUsed = 0, colsUsed = 0;

  const fits = (f: number, cell: number): boolean => {
    if (rowsUsed & (1 << Math.floor(cell / size)) || colsUsed & (1 << (cell % size))) return false;
    for (const c of binary) {
      if (c.figure === f && (cells[c.other] ?? -1) >= 0 && !binaryHolds(c, cell, cells[c.other] ?? 0, size)) return false;
      if (c.other === f && (cells[c.figure] ?? -1) >= 0 && !binaryHolds(c, cells[c.figure] ?? 0, cell, size)) return false;
    }
    return true;
  };

  const step = (placed: number): boolean => {
    if (placed === figureCount) return visit(cells);
    let best = -1;
    let bestOptions: number[] = [];
    for (let f = 0; f < figureCount; f++) {
      if ((cells[f] ?? -1) >= 0) continue;
      const options = (domains[f] ?? []).filter((cell) => fits(f, cell));
      if (options.length === 0) return false;
      if (best < 0 || options.length < bestOptions.length) { best = f; bestOptions = options; }
    }
    for (const cell of bestOptions) {
      const rb = 1 << Math.floor(cell / size), cb = 1 << (cell % size);
      cells[best] = cell; rowsUsed |= rb; colsUsed |= cb;
      if (step(placed + 1)) return true;
      cells[best] = -1; rowsUsed &= ~rb; colsUsed &= ~cb;
    }
    return false;
  };
  step(0);
}

export interface SleuthCheck {
  /** Figuren in dezelfde rij of kolom als een andere figuur, of op een obstakel. */
  ruleConflicts: number[];
  /** Indexen in `clues` van aanwijzingen die niet kloppen. */
  brokenClues: number[];
  /** Alles klopt; omdat de puzzel één oplossing heeft, is dit dé oplossing. */
  solved: boolean;
}

/** Controleert een volledige opstelling van een speler (vakje per figuur) tegen regels en aanwijzingen. */
export function checkSleuthSolution(layout: SleuthLayout, cells: readonly number[]): SleuthCheck {
  assertLayout(layout);
  const { size, figureCount } = layout;
  if (cells.length !== figureCount) throw new RangeError("Geef voor elke figuur een vakje");
  const blocked = new Set(layout.obstacles);
  const ruleConflicts = new Set<number>();
  cells.forEach((a, f) => {
    if (!Number.isInteger(a) || a < 0 || a >= size * size || blocked.has(a)) ruleConflicts.add(f);
    cells.forEach((b, g) => {
      if (f !== g && (a % size === b % size || Math.floor(a / size) === Math.floor(b / size))) ruleConflicts.add(f);
    });
  });
  const brokenClues = layout.clues.flatMap((c, i) => {
    const a = cells[c.figure] ?? -1;
    const ok = isBinary(c) ? binaryHolds(c, a, cells[c.other] ?? -1, size) : unaryHolds(layout, c, a);
    return ok ? [] : [i];
  });
  const conflicts = [...ruleConflicts].sort((a, b) => a - b);
  return { ruleConflicts: conflicts, brokenClues, solved: conflicts.length === 0 && brokenClues.length === 0 };
}

/** Controleert het antwoord op de vraag ("wie staat in kamer K?"). */
export function checkSleuthAnswer(puzzle: Pick<SleuthPuzzle, "answer">, figure: number): boolean {
  return puzzle.answer.figure === figure;
}
