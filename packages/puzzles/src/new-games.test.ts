import { describe, expect, it, vi } from "vitest";

// Elke test maakt 20 puzzels (en controleert ze met de oplosser); onder volle belasting duurt dat langer dan 5 s.
vi.setConfig({ testTimeout: 60_000 });
import {
  bridgeCandidates, countBridgesSolutions, countCrossSumsSolutions, countFleetSolutions, countInequalitySolutions, countIslandsSolutions, countSnakeSolutions,
  countTowersSolutions, generateBridges, generateColorCode, generateCrossSums, generateFleet, generateHanoi, generateInequality, generateIslands, generateLights,
  generatePairs, generateSlide, generateSnake, generateTowers, isSlideSolved, islandsValid, pressLight, PUZZLE_LEVELS, scoreColorGuess, slideNeighbours,
  visibleTowers,
} from "./index.js";

const SEEDS = ["1", "2", "3", "puzzel", "2026-11-14"];
const each = (f: (level: (typeof PUZZLE_LEVELS)[number], seed: string) => void) => {
  for (const level of PUZZLE_LEVELS) for (const seed of SEEDS) f(level, seed);
};
const latin = (n: number, g: readonly number[]) => {
  for (let r = 0; r < n; r++) expect(new Set(g.slice(r * n, r * n + n)).size).toBe(n);
  for (let c = 0; c < n; c++) expect(new Set(Array.from({ length: n }, (_, r) => g[r * n + c])).size).toBe(n);
};

describe("groter-kleiner", () => {
  it("is deterministisch, klopt en heeft één oplossing", () => each((level, seed) => {
    const p = generateInequality({ level, seed });
    expect(generateInequality({ level, seed })).toEqual(p);
    latin(p.size, p.solution);
    p.givens.forEach((g, i) => g !== null && expect(g).toBe(p.solution[i]));
    p.right.forEach((s, i) => s && expect(s === "<" ? p.solution[i]! < p.solution[i + 1]! : p.solution[i]! > p.solution[i + 1]!).toBe(true));
    p.down.forEach((s, i) => s && expect(s === "<" ? p.solution[i]! < p.solution[i + p.size]! : p.solution[i]! > p.solution[i + p.size]!).toBe(true));
    expect(countInequalitySolutions(p)).toBe(1);
  }));
});

describe("torenpuzzel", () => {
  it("telt zichtbare torens", () => {
    expect(visibleTowers([1, 2, 3, 4])).toBe(4);
    expect(visibleTowers([4, 1, 2, 3])).toBe(1);
    expect(visibleTowers([2, 1, 4, 3])).toBe(2);
  });
  it("is deterministisch, klopt en heeft één oplossing", () => each((level, seed) => {
    const p = generateTowers({ level, seed });
    expect(generateTowers({ level, seed })).toEqual(p);
    const n = p.size;
    latin(n, p.solution);
    for (let k = 0; k < n; k++) {
      const col = Array.from({ length: n }, (_, r) => p.solution[r * n + k]!), row = p.solution.slice(k * n, k * n + n);
      if (p.top[k] != null) expect(visibleTowers(col)).toBe(p.top[k]);
      if (p.bottom[k] != null) expect(visibleTowers([...col].reverse())).toBe(p.bottom[k]);
      if (p.left[k] != null) expect(visibleTowers(row)).toBe(p.left[k]);
      if (p.right[k] != null) expect(visibleTowers([...row].reverse())).toBe(p.right[k]);
    }
    expect(countTowersSolutions(p)).toBe(1);
  }));
});

describe("zeeslagpuzzel", () => {
  it("vloot klopt, schepen raken elkaar niet en er is één oplossing", () => each((level, seed) => {
    const p = generateFleet({ level, seed });
    expect(generateFleet({ level, seed })).toEqual(p);
    const n = p.size;
    expect(p.solution.filter(Boolean).length).toBe(p.fleet.reduce((a, b) => a + b, 0));
    // Schuin naast elkaar mag niet (recht naast elkaar hoort bij hetzelfde schip).
    p.solution.forEach((s, i) => {
      if (!s) return;
      const r = Math.floor(i / n), c = i % n;
      for (const [dr, dc] of [[1, 1], [1, -1]]) {
        const rr = r + dr!, cc = c + dc!;
        if (rr < n && cc >= 0 && cc < n) expect(p.solution[rr * n + cc]).toBe(false);
      }
    });
    p.revealed.forEach((v, i) => v && expect(v === "ship").toBe(p.solution[i]));
    expect(countFleetSolutions(p)).toBe(1);
  }));
});

describe("bruggen bouwen", () => {
  it("getallen kloppen, bruggen kruisen niet, alles hangt samen en er is één oplossing", () => each((level, seed) => {
    const p = generateBridges({ level, seed });
    expect(generateBridges({ level, seed })).toEqual(p);
    expect(p.islands.length).toBeGreaterThanOrEqual(level === "starter" ? 6 : 8);
    p.islands.forEach((isle, i) => expect(p.solution.filter((b) => b.a === i || b.b === i).reduce((s, b) => s + b.count, 0)).toBe(isle.n));
    const cand = bridgeCandidates(p.width, p.height, p.islands);
    const used = p.solution.map((b) => cand.find((e) => e.a === b.a && e.b === b.b)!);
    expect(used.every(Boolean)).toBe(true);
    for (const e of used) for (const f of used) if (e.horizontal !== f.horizontal) expect(e.cells.some((c) => f.cells.includes(c))).toBe(false);
    const seen = new Set([0]), stack = [0];
    while (stack.length) { const i = stack.pop()!; for (const b of p.solution) { const j = b.a === i ? b.b : b.b === i ? b.a : -1; if (j >= 0 && !seen.has(j)) { seen.add(j); stack.push(j); } } }
    expect(seen.size).toBe(p.islands.length);
    expect(countBridgesSolutions(p.width, p.height, p.islands)).toBe(1);
  }));
});

describe("getallenslang", () => {
  it("is één pad van 1 tot het eind met één oplossing", () => each((level, seed) => {
    const p = generateSnake({ level, seed });
    expect(generateSnake({ level, seed })).toEqual(p);
    const n = p.size, pos = new Map(p.solution.map((v, i) => [v, i]));
    for (let v = 1; v < n * n; v++) {
      const a = pos.get(v)!, b = pos.get(v + 1)!;
      expect(Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n))).toBe(1);
    }
    expect(p.givens[pos.get(1)!]).toBe(1);
    expect(countSnakeSolutions(n, p.givens)).toBe(1);
  }));
});

describe("lampjespuzzel", () => {
  it("de meegegeven tikken zetten alles uit", () => each((level, seed) => {
    const p = generateLights({ level, seed });
    expect(p.start.some(Boolean)).toBe(true);
    let lights = p.start;
    for (const i of p.presses) lights = pressLight(p.size, lights, i);
    expect(lights.every((l) => !l)).toBe(true);
  }));
});

describe("zee en eilanden", () => {
  it("is geldig en heeft één oplossing", () => each((level, seed) => {
    const p = generateIslands({ level, seed });
    expect(generateIslands({ level, seed })).toEqual(p);
    expect(islandsValid(p.size, p.clues, p.solution)).toBe(true);
    expect(p.clues.filter((c) => c != null).length).toBeGreaterThanOrEqual(2);
    expect(countIslandsSolutions(p.size, p.clues)).toBe(1);
  }));
});

describe("kruissommen", () => {
  it("sommen kloppen, geen dubbele cijfers in een reeks en één oplossing", () => each((level, seed) => {
    const p = generateCrossSums({ level, seed });
    expect(generateCrossSums({ level, seed })).toEqual(p);
    const w = p.width;
    p.cells.forEach((cell, i) => {
      if (!cell) return;
      if (cell.right != null) {
        const run: number[] = [];
        for (let j = i + 1; j % w !== 0 && p.cells[j] === null; j++) run.push(p.solution[j]!);
        expect(run.reduce((a, b) => a + b, 0)).toBe(cell.right);
        expect(new Set(run).size).toBe(run.length);
      }
      if (cell.down != null) {
        const run: number[] = [];
        for (let j = i + w; j < p.cells.length && p.cells[j] === null; j += w) run.push(p.solution[j]!);
        expect(run.reduce((a, b) => a + b, 0)).toBe(cell.down);
        expect(new Set(run).size).toBe(run.length);
      }
    });
    expect(countCrossSumsSolutions(p)).toBe(1);
  }));
});

describe("klassiekers", () => {
  it("schuifpuzzel is gehusseld en terug te schuiven", () => each((level, seed) => {
    const p = generateSlide({ level, seed });
    expect(isSlideSolved(p.tiles)).toBe(false);
    expect([...p.tiles].sort((a, b) => a - b)).toEqual(Array.from({ length: p.size * p.size }, (_, i) => i));
    // Pariteit: alleen standen die met schuiven te bereiken zijn.
    const flat = p.tiles.filter((t) => t), inv = flat.reduce((s, t, i) => s + flat.slice(i + 1).filter((u) => u < t).length, 0);
    const emptyRow = Math.floor(p.tiles.indexOf(0) / p.size);
    expect(p.size % 2 ? inv % 2 : (inv + (p.size - 1 - emptyRow)) % 2).toBe(0);
    expect(slideNeighbours(p.size, p.tiles.indexOf(0)).length).toBeGreaterThanOrEqual(2);
  }));
  it("hanoi: kortste oplossing van 2^n − 1 geldige zetten", () => each((level, seed) => {
    const p = generateHanoi({ level, seed });
    expect(p.solution).toHaveLength(2 ** p.discs - 1);
    const pegs: number[][] = [Array.from({ length: p.discs }, (_, i) => p.discs - i), [], []];
    for (const [from, to] of p.solution) {
      const d = pegs[from]!.pop()!;
      expect(d).toBeDefined();
      expect(pegs[to]!.at(-1) ?? Infinity).toBeGreaterThan(d);
      pegs[to]!.push(d);
    }
    expect(pegs[p.target]).toHaveLength(p.discs);
  }));
  it("kleurcode: score en code", () => {
    expect(scoreColorGuess([0, 1, 2, 3], [0, 2, 1, 5])).toEqual({ exact: 1, color: 2 });
    expect(scoreColorGuess([1, 1, 2, 2], [1, 2, 1, 1])).toEqual({ exact: 1, color: 2 });
    each((level, seed) => {
      const p = generateColorCode({ level, seed });
      expect(p.secret).toHaveLength(p.length);
      expect(p.secret.every((c) => c >= 0 && c < p.colors)).toBe(true);
      if (!p.repeats) expect(new Set(p.secret).size).toBe(p.length);
    });
  });
  it("paren: elke tekening twee keer", () => each((level, seed) => {
    const p = generatePairs({ level, seed, pictures: 16 });
    expect(p.cards).toHaveLength(p.columns * p.rows);
    const counts = new Map<number, number>();
    p.cards.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
    expect([...counts.values()].every((v) => v === 2)).toBe(true);
    expect(() => generatePairs({ level: "expert", seed, pictures: 10 })).toThrow(RangeError);
  }));
});
