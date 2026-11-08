import { createRng, type Rng, type Seed } from "./rng.js";

/** Muurbits per vakje: een gezette bit betekent dat daar een muur staat. */
export const Wall = { N: 1, E: 2, S: 4, W: 8 } as const;
export type WallBit = (typeof Wall)[keyof typeof Wall];

export type MazeShape = "rect";
/**
 * - `backtracker` (standaard): recursive backtracker, lange kronkelende gangen met weinig zijpaden.
 * - `wilson`: algoritme van Wilson, elk perfect doolhof even waarschijnlijk; meer korte doodlopende gangen.
 */
export type MazeAlgorithm = "backtracker" | "wilson";

export interface Point {
  x: number;
  y: number;
}

export interface MazeOptions {
  /** Aantal vakjes horizontaal (1 tot en met 500). */
  width: number;
  /** Aantal vakjes verticaal (1 tot en met 500). */
  height: number;
  seed: Seed;
  shape?: MazeShape;
  algorithm?: MazeAlgorithm;
}

export interface Maze {
  width: number;
  height: number;
  shape: MazeShape;
  algorithm: MazeAlgorithm;
  seed: Seed;
  /** Rij voor rij (index = y * width + x), per vakje een combinatie van `Wall`-bits. */
  cells: number[];
  /** Linksboven. De buitenmuur is overal dicht; de tekening maakt zelf een ingang bij start en eind. */
  start: Point;
  /** Rechtsonder. */
  end: Point;
}

const MAX_SIDE = 500;
const ALL = Wall.N | Wall.E | Wall.S | Wall.W;
const DIRS: readonly { bit: WallBit; opposite: WallBit; dx: number; dy: number }[] = [
  { bit: Wall.N, opposite: Wall.S, dx: 0, dy: -1 },
  { bit: Wall.E, opposite: Wall.W, dx: 1, dy: 0 },
  { bit: Wall.S, opposite: Wall.N, dx: 0, dy: 1 },
  { bit: Wall.W, opposite: Wall.E, dx: -1, dy: 0 },
];

/** Buren van vakje `i` binnen het rooster, met de richting ernaartoe. */
function neighbours(i: number, width: number, height: number) {
  const x = i % width, y = Math.floor(i / width);
  return DIRS.flatMap((d) => {
    const nx = x + d.dx, ny = y + d.dy;
    return nx >= 0 && ny >= 0 && nx < width && ny < height ? [{ dir: d, to: ny * width + nx }] : [];
  });
}

function carve(cells: number[], from: number, to: number, dir: (typeof DIRS)[number]) {
  cells[from] = (cells[from] ?? 0) & ~dir.bit;
  cells[to] = (cells[to] ?? 0) & ~dir.opposite;
}

/**
 * Maakt een perfect doolhof: tussen elk paar vakjes is precies één pad. Deterministisch vanuit de seed.
 */
export function generateMaze(options: MazeOptions): Maze {
  const { width, height, seed, shape = "rect", algorithm = "backtracker" } = options;
  for (const [name, v] of [["width", width], ["height", height]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > MAX_SIDE) throw new RangeError(`${name} moet een geheel getal van 1 tot en met ${MAX_SIDE} zijn, kreeg ${v}`);
  }
  if (shape !== "rect") throw new RangeError(`Onbekende vorm "${String(shape)}"`);
  if (algorithm !== "backtracker" && algorithm !== "wilson") throw new RangeError(`Onbekend algoritme "${String(algorithm)}"`);
  const rng = createRng(`maze|${shape}|${algorithm}|${width}x${height}|${String(seed)}`);
  const cells = new Array<number>(width * height).fill(ALL);
  if (algorithm === "backtracker") backtracker(cells, width, height, rng);
  else wilson(cells, width, height, rng);
  return { width, height, shape, algorithm, seed, cells, start: { x: 0, y: 0 }, end: { x: width - 1, y: height - 1 } };
}

function backtracker(cells: number[], width: number, height: number, rng: Rng) {
  const visited = new Array<boolean>(cells.length).fill(false);
  const first = rng.int(cells.length);
  const stack = [first];
  visited[first] = true;
  while (stack.length) {
    const current = stack[stack.length - 1] ?? 0;
    const open = neighbours(current, width, height).filter((n) => !visited[n.to]);
    if (!open.length) { stack.pop(); continue; }
    const { dir, to } = rng.pick(open);
    carve(cells, current, to, dir);
    visited[to] = true;
    stack.push(to);
  }
}

function wilson(cells: number[], width: number, height: number, rng: Rng) {
  const inTree = new Array<boolean>(cells.length).fill(false);
  inTree[rng.int(cells.length)] = true;
  // Per vakje de laatst gekozen stap van de wandeling; overschrijven wist lussen vanzelf.
  const step = new Array<{ dir: (typeof DIRS)[number]; to: number } | undefined>(cells.length);
  for (const startCell of rng.shuffle([...cells.keys()])) {
    if (inTree[startCell]) continue;
    let i = startCell;
    while (!inTree[i]) {
      const s = rng.pick(neighbours(i, width, height));
      step[i] = s;
      i = s.to;
    }
    i = startCell;
    while (!inTree[i]) {
      const s = step[i];
      if (!s) break;
      carve(cells, i, s.to, s.dir);
      inTree[i] = true;
      i = s.to;
    }
  }
}

/**
 * Kortste (en in een perfect doolhof enige) pad van `from` naar `to`, inclusief begin en eind.
 * Standaard van start naar eind. Geeft `null` als er geen pad is.
 */
export function solveMaze(maze: Maze, from: Point = maze.start, to: Point = maze.end): Point[] | null {
  const { width, height, cells } = maze;
  const inside = (p: Point) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  if (!inside(from) || !inside(to)) throw new RangeError("Punt ligt buiten het doolhof");
  const source = from.y * width + from.x;
  const target = to.y * width + to.x;
  const prev = new Array<number>(cells.length).fill(-1);
  prev[source] = source;
  const queue = [source];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] ?? 0;
    if (i === target) break;
    for (const { dir, to: n } of neighbours(i, width, height)) {
      if ((cells[i] ?? 0) & dir.bit || prev[n] !== -1) continue;
      prev[n] = i;
      queue.push(n);
    }
  }
  if (prev[target] === -1) return null;
  const path: Point[] = [];
  for (let i = target; ; i = prev[i] ?? source) {
    path.push({ x: i % width, y: Math.floor(i / width) });
    if (i === source) break;
  }
  return path.reverse();
}
