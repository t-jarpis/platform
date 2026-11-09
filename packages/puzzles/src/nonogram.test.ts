import { describe, expect, it } from "vitest";
import { checkNonogram, createNonogram, generateRandomNonogram, isLineSolvable, nonogramClues, solveNonogramLines } from "./index.js";

const parse = (rows: string[]) => rows.map((r) => [...r].map((c) => c === "#"));
const SEEDS = Array.from({ length: 30 }, (_, i) => `seed-${i}`);

/** Onafhankelijke teller: probeert alle rijen die bij de rij-aanwijzing passen en controleert de kolommen. */
function countByBruteForce(clues: { rows: number[][]; columns: number[][] }, limit = 2): number {
  const width = clues.columns.length;
  const options = clues.rows.map((clue) => {
    const out: boolean[][] = [];
    for (let m = 0; m < 1 << width; m++) {
      const row = Array.from({ length: width }, (_, x) => ((m >> x) & 1) === 1);
      if (nonogramClues([row]).rows[0]!.join() === clue.join()) out.push(row);
    }
    return out;
  });
  let n = 0;
  const grid: boolean[][] = [];
  const rec = (y: number) => {
    if (n >= limit) return;
    if (y === clues.rows.length) {
      if (nonogramClues(grid).columns.every((c, x) => c.join() === clues.columns[x]!.join())) n++;
      return;
    }
    for (const row of options[y]!) { grid.push(row); rec(y + 1); grid.pop(); }
  };
  rec(0);
  return n;
}

describe("nonogramClues", () => {
  it("maakt rij- en kolomaanwijzingen, lege lijnen als []", () => {
    const image = parse(["##.#", "....", "####"]);
    expect(nonogramClues(image)).toEqual({ rows: [[2, 1], [], [4]], columns: [[1, 1], [1, 1], [1], [1, 1]] });
  });
  it("weigert een rafelig of leeg plaatje", () => {
    expect(() => nonogramClues([])).toThrow(RangeError);
    expect(() => nonogramClues([[true], [true, false]])).toThrow(RangeError);
  });
});

describe("lijn-oplosser en isLineSolvable", () => {
  it("lost een eigen tekening zonder gokken op", () => {
    const heart = parse([".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."]);
    expect(isLineSolvable(heart)).toBe(true);
    const n = createNonogram(heart);
    expect(n.solution).toEqual(heart);
    expect(n.difficulty.lineSteps).toBeGreaterThan(0);
  });

  it("herkent een tekening met meer oplossingen (diagonaal 2×2)", () => {
    const diagonal = parse(["#.", ".#"]);
    expect(isLineSolvable(diagonal)).toBe(false);
    const s = solveNonogramLines(nonogramClues(diagonal));
    expect(s.solved).toBe(false);
    expect(s.grid.flat().every((c) => c === "unknown")).toBe(true);
    expect(() => createNonogram(diagonal)).toThrow(RangeError);
  });

  it("vindt een tegenspraak", () => {
    expect(solveNonogramLines({ rows: [[2], []], columns: [[], []] }).contradiction).toBe(true);
  });

  it("is consistent met een brute-force-teller over willekeurige kleine tekeningen", () => {
    for (let i = 0; i < 60; i++) {
      const image = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ((i * 7 + y * 13 + x * 31 + ((i * x * y) % 5)) % 3) !== 0));
      if (isLineSolvable(image)) expect(countByBruteForce(nonogramClues(image))).toBe(1);
    }
  });
});

describe("generateRandomNonogram", () => {
  const sizes = [[5, 5], [10, 10], [15, 10]] as const;

  it.each(sizes)("%i×%i is voor tientallen seeds uniek en zonder gokken op te lossen", (width, height) => {
    for (const seed of SEEDS) {
      const n = generateRandomNonogram({ seed, width, height });
      expect([n.width, n.height]).toEqual([width, height]);
      expect(isLineSolvable(n.solution)).toBe(true);
      expect(nonogramClues(n.solution)).toEqual({ rows: n.rows, columns: n.columns });
      expect(checkNonogram(n, n.solution).solved).toBe(true);
    }
  }, 30_000);

  it("is bij kleine roosters ook volgens de brute-force-teller uniek", () => {
    for (const seed of SEEDS.slice(0, 15)) expect(countByBruteForce(generateRandomNonogram({ seed, width: 6, height: 6 }))).toBe(1);
  });

  it("volgt de dichtheid ongeveer", () => {
    const share = (density: number) => {
      const cells = SEEDS.map((seed) => generateRandomNonogram({ seed, width: 12, height: 12, density }).solution.flat());
      return cells.flat().filter(Boolean).length / cells.flat().length;
    };
    expect(share(0.7)).toBeGreaterThan(share(0.5));
  });

  it("weigert ongeldige opties", () => {
    expect(() => generateRandomNonogram({ seed: 1, width: 5, height: 5, density: 1 })).toThrow(RangeError);
    expect(() => generateRandomNonogram({ seed: 1, width: 0, height: 5 })).toThrow(RangeError);
  });

  it("is deterministisch en blijft tussen versies gelijk (vaste puzzel)", () => {
    const a = generateRandomNonogram({ seed: "golden", width: 8, height: 6 });
    expect(generateRandomNonogram({ seed: "golden", width: 8, height: 6 })).toEqual(a);
    expect(a.solution.map((r) => r.map((v) => (v ? 1 : 0)).join("")).join("/")).toBe("00011010/11001011/11100010/01010110/10010110/01001000");
  });
});

describe("checkNonogram", () => {
  it("meldt foute rijen en kolommen", () => {
    const n = createNonogram(parse(["##.", "#..", "###"]));
    const entry = parse(["##.", "...", "###"]);
    expect(checkNonogram(n, entry)).toEqual({ wrongRows: [1], wrongColumns: [0], solved: false });
  });
});
