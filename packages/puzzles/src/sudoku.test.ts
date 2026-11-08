import { describe, expect, it } from "vitest";
import {
  conflicts, countSolutions, generateSudoku, GIVENS_RANGE, gradeSudoku, SINGLES, solveSudoku, validateSudokuEntry,
  type Sudoku, type SudokuLevel, type SudokuSize,
} from "./index.js";

const SEEDS = Array.from({ length: 30 }, (_, i) => `seed-${i}`);
const COMBOS: [SudokuSize, SudokuLevel][] = [
  [4, "starter"], [4, "advanced"], [4, "expert"],
  [6, "starter"], [6, "advanced"], [6, "expert"],
  [9, "starter"], [9, "advanced"], [9, "expert"], [9, "large-print"],
];
const filled = (grid: readonly number[]) => grid.filter((v) => v !== 0).length;
const beyondSingles = (p: Sudoku) => p.difficulty.techniques.some((t) => !SINGLES.includes(t));

const generated = new Map<string, Sudoku[]>();
const batch = (size: SudokuSize, level: SudokuLevel) => {
  const key = `${size}|${level}`;
  let list = generated.get(key);
  if (!list) { list = SEEDS.map((seed) => generateSudoku({ size, level, seed })); generated.set(key, list); }
  return list;
};
const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Een bekende 9×9 met één oplossing.
const CLASSIC = "530070000600195000098000060800060003400803001700020006060000280000419005000080079".split("").map(Number);

describe.each(COMBOS)("generateSudoku formaat %i, niveau %s", (size, level) => {
  it(`maakt voor ${SEEDS.length} seeds puzzels met precies één oplossing`, () => {
    for (const p of batch(size, level)) {
      expect(p.size).toBe(size);
      expect(p.level).toBe(level);
      expect(p.givens).toHaveLength(size * size);
      expect(countSolutions(p.givens, size)).toBe(1);
    }
  }, 30_000);

  it("geeft een oplossing die aan alle regels voldoet en de gegeven cijfers bevat", () => {
    for (const p of batch(size, level)) {
      expect(p.solution.every((v) => v >= 1 && v <= size)).toBe(true);
      expect(conflicts(p.solution, size)).toEqual([]);
      p.givens.forEach((v, i) => { if (v !== 0) expect(v).toBe(p.solution[i]); });
      expect(solveSudoku(p.givens, size)).toEqual(p.solution);
    }
  }, 30_000);

  it("krijgt het bedoelde niveau", () => {
    for (const p of batch(size, level)) {
      const g = gradeSudoku(p.givens, size);
      expect(g.solved).toBe(true);
      expect(p.difficulty).toEqual({ score: g.score, techniques: g.techniques });
      if (level === "expert") {
        // Voorbij singles, of anders minder gegeven cijfers dan het minimum van advanced.
        expect(beyondSingles(p) || filled(p.givens) < GIVENS_RANGE[size].advanced[0]).toBe(true);
      } else {
        expect(gradeSudoku(p.givens, size, { techniques: "singles" }).solved).toBe(true);
        expect(beyondSingles(p)).toBe(false);
        const [min, max] = GIVENS_RANGE[size][level === "advanced" ? "advanced" : "starter"];
        expect(filled(p.givens)).toBeGreaterThanOrEqual(min);
        expect(filled(p.givens)).toBeLessThanOrEqual(max);
      }
    }
  }, 30_000);
});

describe("niveaus", () => {
  it.each([4, 6, 9] as const)("formaat %i: gemiddelde score stijgt van starter via advanced naar expert", (size) => {
    const scores = (["starter", "advanced", "expert"] as const).map((l) => average(batch(size, l).map((p) => p.difficulty.score)));
    expect(scores[0]).toBeLessThan(scores[1]!);
    expect(scores[1]).toBeLessThan(scores[2]!);
  }, 30_000);

  it("9×9 expert vraagt bijna altijd een techniek voorbij singles", () => {
    const share = batch(9, "expert").filter(beyondSingles).length / SEEDS.length;
    expect(share).toBeGreaterThanOrEqual(0.9);
  }, 30_000);

  it("large-print is altijd 9×9 en weigert andere formaten", () => {
    expect(generateSudoku({ level: "large-print", seed: 1 }).size).toBe(9);
    expect(() => generateSudoku({ size: 6, level: "large-print", seed: 1 })).toThrow(RangeError);
  });

  it("weigert een onbekend niveau of formaat", () => {
    expect(() => generateSudoku({ size: 9, level: "nightmare" as SudokuLevel, seed: 1 })).toThrow(RangeError);
    expect(() => generateSudoku({ size: 8 as SudokuSize, level: "starter", seed: 1 })).toThrow(RangeError);
  });
});

describe("determinisme", () => {
  it("geeft bij dezelfde opties dezelfde puzzel", () => {
    for (const [size, level] of COMBOS) {
      expect(generateSudoku({ size, level, seed: "same" })).toEqual(generateSudoku({ size, level, seed: "same" }));
    }
  });

  it("geeft bij een andere seed of een ander niveau een andere puzzel", () => {
    const a = generateSudoku({ size: 9, level: "starter", seed: 1 });
    expect(generateSudoku({ size: 9, level: "starter", seed: 2 }).givens).not.toEqual(a.givens);
    expect(generateSudoku({ size: 9, level: "large-print", seed: 1 }).givens).not.toEqual(a.givens);
  });

  it("blijft tussen versies gelijk (vaste puzzels)", () => {
    // Verandert dit, dan krijgen opgeslagen seeds een andere puzzel: dat is een major-versie.
    expect(generateSudoku({ size: 9, level: "expert", seed: "golden" }).givens.join("")).toBe(
      "000067030000000801700800600650008000038000507000400000009640000010070000000000152",
    );
    expect(generateSudoku({ size: 4, level: "starter", seed: "golden" }).givens.join("")).toBe("0130400232001403");
  });
});

describe("snelheid", () => {
  it("maakt een 9×9 expert gemiddeld binnen een seconde", () => {
    const n = 10;
    const started = Date.now();
    for (let i = 0; i < n; i++) generateSudoku({ size: 9, level: "expert", seed: `perf-${i}` });
    expect((Date.now() - started) / n).toBeLessThan(1000);
  }, 30_000);
});

describe("solveSudoku en countSolutions", () => {
  it("lost een bekende puzzel op", () => {
    const solution = solveSudoku(CLASSIC, 9)!;
    expect(solution.join("")).toBe("534678912672195348198342567859761423426853791713924856961537284287419635345286179");
    expect(countSolutions(CLASSIC, 9)).toBe(1);
  });

  it("stopt met tellen bij de limiet", () => {
    const empty = new Array<number>(81).fill(0);
    expect(countSolutions(empty, 9)).toBe(2);
    expect(countSolutions(new Array<number>(16).fill(0), 4, 10)).toBe(10);
    expect(countSolutions(new Array<number>(16).fill(0), 4, 1000)).toBe(288);
  });

  it("vindt geen oplossing bij botsende gegeven cijfers", () => {
    const bad = CLASSIC.slice();
    bad[2] = 5; // tweede 5 in de eerste rij
    expect(countSolutions(bad, 9)).toBe(0);
    expect(solveSudoku(bad, 9)).toBeNull();
    expect(gradeSudoku(bad, 9).solved).toBe(false);
  });

  it("weigert een rooster met de verkeerde vorm of waarden", () => {
    expect(() => countSolutions([1, 2, 3], 4)).toThrow(RangeError);
    expect(() => solveSudoku(new Array<number>(16).fill(5), 4)).toThrow(RangeError);
  });
});

describe("gradeSudoku", () => {
  it("lost een makkelijke puzzel op met alleen singles", () => {
    const g = gradeSudoku(CLASSIC, 9, { techniques: "singles" });
    expect(g.solved).toBe(true);
    expect(g.techniques.every((t) => SINGLES.includes(t))).toBe(true);
    expect(g.grid).toEqual(solveSudoku(CLASSIC, 9));
  });

  it("loopt vast op een lege 4×4 (meer dan één oplossing)", () => {
    expect(gradeSudoku(new Array<number>(16).fill(0), 4).solved).toBe(false);
  });
});

describe("conflicts en validateSudokuEntry", () => {
  const p = generateSudoku({ size: 6, level: "starter", seed: "check" });

  it("vindt botsingen in rij, kolom en vak", () => {
    const grid = new Array<number>(16).fill(0);
    grid[0] = 1; grid[3] = 1;  // zelfde rij
    grid[5] = 2; grid[13] = 2; // zelfde kolom
    grid[10] = 3; grid[15] = 3; // zelfde vak (rechtsonder)
    grid[6] = 4;                // geen botsing
    expect(conflicts(grid, 4)).toEqual([0, 3, 5, 10, 13, 15]);
    expect(conflicts(new Array<number>(16).fill(0), 4)).toEqual([]);
  });

  it("keurt de oplossing goed", () => {
    expect(validateSudokuEntry(p.givens, p.solution, 6)).toEqual({ conflicts: [], changedGivens: [], complete: true, solved: true });
  });

  it("meldt een onvolledig rooster zonder fouten", () => {
    const check = validateSudokuEntry(p.givens, p.givens, 6);
    expect(check).toMatchObject({ conflicts: [], changedGivens: [], complete: false, solved: false });
  });

  it("meldt botsingen en veranderde gegeven cijfers", () => {
    const entry = p.solution.slice();
    const given = p.givens.findIndex((v) => v !== 0);
    const other = p.solution.findIndex((v, i) => i !== given && Math.floor(i / 6) === Math.floor(given / 6) && v !== p.solution[given]);
    entry[given] = p.solution[other]!;
    const check = validateSudokuEntry(p.givens, entry, 6);
    expect(check.changedGivens).toEqual([given]);
    expect(check.conflicts).toContain(given);
    expect(check.conflicts).toContain(other);
    expect(check.solved).toBe(false);
  });
});
