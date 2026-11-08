import { describe, expect, it } from "vitest";
import { generateMaze, solveMaze, Wall, type Maze, type MazeAlgorithm } from "./index.js";

const ALGORITHMS: MazeAlgorithm[] = ["backtracker", "wilson"];
const SIZES = [[1, 1], [2, 1], [1, 5], [5, 5], [12, 7], [30, 30]] as const;
const STEPS = [
  { bit: Wall.N, back: Wall.S, dx: 0, dy: -1 },
  { bit: Wall.E, back: Wall.W, dx: 1, dy: 0 },
  { bit: Wall.S, back: Wall.N, dx: 0, dy: 1 },
  { bit: Wall.W, back: Wall.E, dx: -1, dy: 0 },
];
const at = (m: Maze, x: number, y: number) => m.cells[y * m.width + x]!;

/** Controleert dat het doolhof een opspannende boom is: samenhangend en met precies cellen - 1 doorgangen. */
function expectPerfect(m: Maze) {
  let passages = 0;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      for (const s of STEPS) {
        const nx = x + s.dx, ny = y + s.dy;
        const open = !(at(m, x, y) & s.bit);
        if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) { expect(open).toBe(false); continue; }
        expect(!(at(m, nx, ny) & s.back)).toBe(open); // muren aan beide kanten gelijk
        if (open && (s.bit === Wall.E || s.bit === Wall.S)) passages++;
      }
    }
  }
  expect(passages).toBe(m.width * m.height - 1);
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % m.width, y = Math.floor(i / m.width);
    for (const s of STEPS) {
      if (m.cells[i]! & s.bit) continue;
      const n = (y + s.dy) * m.width + (x + s.dx);
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  expect(seen.size).toBe(m.width * m.height);
}

function expectValidPath(m: Maze, path: { x: number; y: number }[], from = m.start, to = m.end) {
  expect(path[0]).toEqual(from);
  expect(path[path.length - 1]).toEqual(to);
  expect(new Set(path.map((p) => `${p.x},${p.y}`)).size).toBe(path.length);
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!, b = path[k]!;
    const s = STEPS.find((d) => a.x + d.dx === b.x && a.y + d.dy === b.y);
    expect(s).toBeDefined();
    expect(at(m, a.x, a.y) & s!.bit).toBe(0);
  }
}

describe.each(ALGORITHMS)("generateMaze (%s)", (algorithm) => {
  it.each(SIZES)("maakt een perfect, oplosbaar doolhof van %i×%i", (width, height) => {
    for (let seed = 0; seed < 10; seed++) {
      const m = generateMaze({ width, height, seed, algorithm });
      expect(m.cells).toHaveLength(width * height);
      expect(m.start).toEqual({ x: 0, y: 0 });
      expect(m.end).toEqual({ x: width - 1, y: height - 1 });
      expectPerfect(m);
      expectValidPath(m, solveMaze(m)!);
    }
  });

  it("is deterministisch", () => {
    const opts = { width: 20, height: 15, seed: "same", algorithm };
    expect(generateMaze(opts)).toEqual(generateMaze(opts));
    expect(generateMaze({ ...opts, seed: "other" }).cells).not.toEqual(generateMaze(opts).cells);
  });
});

describe("generateMaze", () => {
  it("blijft tussen versies gelijk (vaste doolhoven)", () => {
    expect(generateMaze({ width: 6, height: 4, seed: "golden" }).cells).toEqual(
      [13, 3, 9, 1, 5, 3, 9, 2, 10, 10, 13, 6, 10, 14, 10, 10, 9, 7, 12, 5, 6, 12, 4, 7],
    );
    expect(generateMaze({ width: 6, height: 4, seed: "golden", algorithm: "wilson" }).cells).toEqual(
      [11, 9, 5, 3, 11, 11, 10, 14, 13, 2, 10, 10, 10, 9, 1, 4, 2, 10, 12, 6, 14, 13, 4, 6],
    );
  });

  it("gebruikt standaard de backtracker en een rechthoek", () => {
    expect(generateMaze({ width: 3, height: 3, seed: 1 })).toMatchObject({ shape: "rect", algorithm: "backtracker", seed: 1 });
  });

  it("weigert ongeldige afmetingen, vormen en algoritmen", () => {
    expect(() => generateMaze({ width: 0, height: 3, seed: 1 })).toThrow(RangeError);
    expect(() => generateMaze({ width: 2.5, height: 3, seed: 1 })).toThrow(RangeError);
    expect(() => generateMaze({ width: 501, height: 3, seed: 1 })).toThrow(RangeError);
    expect(() => generateMaze({ width: 3, height: 3, seed: 1, shape: "hex" as "rect" })).toThrow(RangeError);
    expect(() => generateMaze({ width: 3, height: 3, seed: 1, algorithm: "prim" as MazeAlgorithm })).toThrow(RangeError);
  });
});

describe("solveMaze", () => {
  it("vindt het pad tussen willekeurige punten", () => {
    const m = generateMaze({ width: 15, height: 10, seed: "points", algorithm: "wilson" });
    const from = { x: 7, y: 3 }, to = { x: 2, y: 9 };
    expectValidPath(m, solveMaze(m, from, to)!, from, to);
    expect(solveMaze(m, from, from)).toEqual([from]);
  });

  it("geeft null als er geen pad is", () => {
    const m: Maze = { ...generateMaze({ width: 2, height: 1, seed: 1 }), cells: [15, 15] };
    expect(solveMaze(m)).toBeNull();
  });

  it("weigert punten buiten het doolhof", () => {
    const m = generateMaze({ width: 3, height: 3, seed: 1 });
    expect(() => solveMaze(m, { x: 3, y: 0 })).toThrow(RangeError);
  });
});
