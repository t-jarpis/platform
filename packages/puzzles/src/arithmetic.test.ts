import { describe, expect, it } from "vitest";
import {
  checkMagicSquare, checkMathGrid, checkNumberPyramid, countMathGridSolutions, generateMagicSquare, generateMathGrid, generateNumberPyramid,
  isMagicSquare, MAGIC_SQUARE_LEVELS, MATH_GRID_LEVELS, NUMBER_PYRAMID_LEVELS, PUZZLE_LEVELS, solveMagicSquare, solveMathGrid, solveNumberPyramid,
  type MathGrid, type MathOperator,
} from "./index.js";

const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i}`);
const count = (xs: readonly unknown[]) => xs.filter((v) => v !== null).length;

/** Rang van een stelsel (Gauss, met breuken als floats; de getallen zijn klein). Onafhankelijk van de oplosser in het pakket. */
function rank(matrix: number[][]): number {
  const m = matrix.map((r) => r.slice());
  let r = 0;
  const cols = m[0]?.length ?? 0;
  for (let c = 0; c < cols && r < m.length; c++) {
    const pivot = m.findIndex((row, i) => i >= r && Math.abs(row[c]!) > 1e-9);
    if (pivot < 0) continue;
    [m[r], m[pivot]] = [m[pivot]!, m[r]!];
    for (let i = 0; i < m.length; i++) {
      if (i === r) continue;
      const f = m[i]![c]! / m[r]![c]!;
      for (let k = 0; k < cols; k++) m[i]![k] = m[i]![k]! - f * m[r]![k]!;
    }
    r++;
  }
  return r;
}

describe.each(PUZZLE_LEVELS)("rekenpiramide niveau %s", (level) => {
  const s = NUMBER_PYRAMID_LEVELS[level];
  const puzzles = SEEDS.map((seed) => generateNumberPyramid({ seed, level }));

  it("klopt: elk vakje is de som van de twee eronder, getallen in het bereik", () => {
    for (const p of puzzles) {
      expect(p.solution).toHaveLength(s.rows);
      for (let r = 0; r < p.rows - 1; r++) p.solution[r]!.forEach((v, i) => expect(v).toBe(p.solution[r + 1]![i]! + p.solution[r + 1]![i + 1]!));
      for (const v of p.solution.at(-1)!) { expect(v).toBeGreaterThanOrEqual(s.bottom[0]); expect(v).toBeLessThanOrEqual(s.bottom[1]); }
      p.givens.forEach((row, r) => row.forEach((v, i) => { if (v !== null) expect(v).toBe(p.solution[r]![i]); }));
    }
  });

  it("is stap voor stap op te lossen en heeft precies één oplossing (onafhankelijk via de rang)", () => {
    for (const p of puzzles) {
      const solved = solveNumberPyramid(p.givens);
      expect(solved.solved).toBe(true);
      expect(solved.grid).toEqual(p.solution);
      // Onbekenden: de onderste rij. Elk gegeven vakje is een lineaire vergelijking daarin.
      const n = p.rows;
      const weights = (r: number, i: number): number[] => {
        if (r === n - 1) return Array.from({ length: n }, (_, k) => (k === i ? 1 : 0));
        const a = weights(r + 1, i), b = weights(r + 1, i + 1);
        return a.map((v, k) => v + b[k]!);
      };
      const rows = p.givens.flatMap((row, r) => row.flatMap((v, i) => (v === null ? [] : [weights(r, i)])));
      expect(rank(rows)).toBe(n);
    }
  });

  it("geeft de onderste rij deels en het aantal gegeven vakjes van het niveau", () => {
    for (const p of puzzles) {
      const bottom = p.givens.at(-1)!;
      expect(count(bottom)).toBeGreaterThanOrEqual(1);
      expect(bottom.length - count(bottom)).toBeGreaterThanOrEqual(s.bottomMissing);
      expect(p.difficulty.givens).toBe(count(p.givens.flat()));
      expect(p.difficulty.givens).toBeLessThanOrEqual(s.rows + s.extraGivens);
    }
  });
});

describe("rekenpiramide", () => {
  it("controleert een invulling", () => {
    const p = generateNumberPyramid({ seed: "check", level: "advanced" });
    expect(checkNumberPyramid(p.givens, p.solution)).toEqual({ changedGivens: [], wrongSums: [], complete: true, solved: true });
    const wrong = p.solution.map((r) => r.slice());
    wrong[0]![0] = wrong[0]![0]! + 1;
    expect(checkNumberPyramid(p.givens, wrong).wrongSums).toEqual([[0, 0]]);
    expect(checkNumberPyramid(p.givens, p.givens).complete).toBe(false);
  });

  it("weigert een verkeerde vorm en ondersteunt eigen aantal rijen", () => {
    expect(() => solveNumberPyramid([[1], [1, 2, 3]])).toThrow(RangeError);
    expect(generateNumberPyramid({ seed: 1, level: "starter", rows: 6 }).solution).toHaveLength(6);
    expect(() => generateNumberPyramid({ seed: 1, level: "starter", rows: 9 })).toThrow(RangeError);
  });

  it("blijft tussen versies gelijk (vaste puzzel)", () => {
    const p = generateNumberPyramid({ seed: "golden", level: "advanced" });
    expect(p.givens).toEqual([[null], [null, 15], [4, 8, null], [null, 2, null, null]]);
    expect(p.solution).toEqual([[27], [12, 15], [4, 8, 7], [2, 2, 6, 1]]);
  });
});

const evalLine = (v: number[], ops: readonly MathOperator[]) => {
  const ap = (a: number, o: MathOperator, b: number) => (o === "+" ? a + b : o === "-" ? a - b : a * b);
  return ap(ap(v[0]!, ops[0]!, v[1]!), ops[1]!, v[2]!);
};

describe.each(PUZZLE_LEVELS)("rekenrooster niveau %s", (level) => {
  const s = MATH_GRID_LEVELS[level];
  const puzzles = SEEDS.map((seed) => generateMathGrid({ seed, level }));

  it("heeft een oplossing die alle uitkomsten waarmaakt, met verschillende getallen en tussenuitkomsten ≥ 0", () => {
    for (const p of puzzles) {
      expect(p.evaluation).toBe("left-to-right");
      expect(new Set(p.solution).size).toBe(9);
      expect(p.solution.every((v) => v >= 1 && v <= s.max)).toBe(true);
      for (let k = 0; k < 3; k++) {
        const row = p.solution.slice(k * 3, k * 3 + 3), col = [p.solution[k]!, p.solution[k + 3]!, p.solution[k + 6]!];
        expect(evalLine(row, p.rowOperators[k]!)).toBe(p.rowResults[k]);
        expect(evalLine(col, p.columnOperators[k]!)).toBe(p.columnResults[k]);
        for (const [line, ops] of [[row, p.rowOperators[k]!], [col, p.columnOperators[k]!]] as const) {
          expect(evalLine([line[0]!, line[1]!, 0], [ops[0], "+"])).toBeGreaterThanOrEqual(0);
          expect(evalLine(line, ops)).toBeLessThanOrEqual(s.maxResult);
        }
        expect([...p.rowOperators[k]!, ...p.columnOperators[k]!].every((o) => s.operators.includes(o))).toBe(true);
      }
    }
  });

  it("heeft precies één oplossing en minstens het aantal gegeven vakjes van het niveau", () => {
    for (const p of puzzles) {
      expect(countMathGridSolutions(p, 5)).toBe(1);
      expect(solveMathGrid(p)).toEqual(p.solution);
      expect(count(p.givens)).toBeGreaterThanOrEqual(s.minGivens);
      p.givens.forEach((v, i) => { if (v !== null) expect(v).toBe(p.solution[i]); });
    }
  });
});

describe("rekenrooster", () => {
  /** Onafhankelijke controle: alle 9! volgordes van 1–9 proberen. */
  function bruteForce(p: MathGrid): number {
    let n = 0;
    const perm: number[] = [];
    const used = new Set<number>();
    const rec = () => {
      if (perm.length === 9) {
        for (let k = 0; k < 3; k++) {
          if (evalLine(perm.slice(k * 3, k * 3 + 3), p.rowOperators[k]!) !== p.rowResults[k]) return;
          if (evalLine([perm[k]!, perm[k + 3]!, perm[k + 6]!], p.columnOperators[k]!) !== p.columnResults[k]) return;
        }
        n++;
        return;
      }
      const given = p.givens[perm.length];
      for (let v = 1; v <= 9; v++) {
        if (used.has(v) || (given !== null && given !== v)) continue;
        perm.push(v); used.add(v); rec(); perm.pop(); used.delete(v);
      }
    };
    rec();
    return n;
  }

  it("is ook volgens een brute-force-teller uniek", () => {
    for (const seed of ["bf-1", "bf-2", "bf-3"]) {
      expect(bruteForce(generateMathGrid({ seed, level: "advanced" }))).toBe(1);
    }
  }, 30_000);

  it("controleert een invulling", () => {
    const p = generateMathGrid({ seed: "check", level: "starter" });
    expect(checkMathGrid(p, p.solution)).toMatchObject({ complete: true, solved: true });
    const swapped = p.solution.slice();
    [swapped[0], swapped[8]] = [swapped[8]!, swapped[0]!];
    expect(checkMathGrid(p, swapped).solved).toBe(false);
    const dup = p.solution.slice();
    dup[0] = dup[1]!;
    expect(checkMathGrid(p, dup).invalidCells).toEqual(expect.arrayContaining([0, 1]));
  });

  it("blijft tussen versies gelijk (vaste puzzel)", () => {
    const p = generateMathGrid({ seed: "golden", level: "advanced" });
    expect(p.solution.join("")).toBe("489751632");
    expect(p.givens).toEqual([null, null, 9, null, 5, null, null, null, null]);
    expect(p.rowOperators).toEqual([["+", "+"], ["-", "+"], ["+", "*"]]);
    expect(p.columnOperators).toEqual([["*", "+"], ["-", "+"], ["-", "+"]]);
  });
});

describe.each(PUZZLE_LEVELS)("magisch vierkant niveau %s", (level) => {
  const s = MAGIC_SQUARE_LEVELS[level];
  const puzzles = SEEDS.map((seed) => generateMagicSquare({ seed, level }));

  it("is magisch, met de reeks start + step·k", () => {
    for (const p of puzzles) {
      expect(p.size).toBe(s.size);
      expect(isMagicSquare(p.solution, p.size)).toBe(true);
      const sorted = p.solution.slice().sort((a, b) => a - b);
      expect(sorted).toEqual(sorted.map((_, k) => p.start + p.step * k));
      expect(p.magicSum).toBe(p.solution.slice(0, p.size).reduce((a, b) => a + b, 0));
    }
  });

  it("is stap voor stap op te lossen en heeft precies één invulling (onafhankelijk via de rang)", () => {
    for (const p of puzzles) {
      const solved = solveMagicSquare(p.givens, p.size, p.magicSum);
      expect(solved.solved).toBe(true);
      expect(solved.grid).toEqual(p.solution);
      const n = p.size, cells = n * n;
      const unit = (i: number) => Array.from({ length: cells }, (_, k) => (k === i ? 1 : 0));
      const line = (idx: number[]) => Array.from({ length: cells }, (_, k) => (idx.includes(k) ? 1 : 0));
      const eqs = [
        ...Array.from({ length: n }, (_, r) => line(Array.from({ length: n }, (_, c) => r * n + c))),
        ...Array.from({ length: n }, (_, c) => line(Array.from({ length: n }, (_, r) => r * n + c))),
        line(Array.from({ length: n }, (_, k) => k * n + k)),
        line(Array.from({ length: n }, (_, k) => k * n + n - 1 - k)),
        ...p.givens.flatMap((v, i) => (v === null ? [] : [unit(i)])),
      ];
      expect(rank(eqs)).toBe(cells);
    }
  });

  it("geeft meer hulp op de makkelijke niveaus", () => {
    for (const p of puzzles) {
      expect(p.difficulty.givens).toBe(count(p.givens));
      expect(count(p.givens)).toBeLessThan(p.size * p.size);
    }
  });
});

describe("magisch vierkant", () => {
  it("maakt ook 4×4 op een makkelijk niveau en controleert een invulling", () => {
    const p = generateMagicSquare({ seed: 3, level: "starter", size: 4 });
    expect(p.size).toBe(4);
    expect(checkMagicSquare(p, p.solution)).toEqual({ changedGivens: [], wrongLines: [], complete: true, solved: true });
    const wrong = p.solution.slice();
    [wrong[0], wrong[1]] = [wrong[1]!, wrong[0]!];
    expect(checkMagicSquare(p, wrong).solved).toBe(false);
  });

  it("blijft tussen versies gelijk (vaste puzzel)", () => {
    const p = generateMagicSquare({ seed: "golden", level: "expert" });
    expect(p.givens).toEqual([12, 9, null, null, null, 16, 14, 7, null, null, null, null, 15, 22, 8, null]);
    expect(p.solution.join(",")).toBe("12,9,19,18,21,16,14,7,10,11,17,20,15,22,8,13");
  });
});
