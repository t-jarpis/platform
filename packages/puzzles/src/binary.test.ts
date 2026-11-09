import { describe, expect, it } from "vitest";
import {
  BINARY_BASIC, BINARY_LEVELS, binaryConflicts, countBinarySolutions, generateBinary, gradeBinary, isValidBinary, PUZZLE_LEVELS, solveBinary,
  validateBinaryEntry, type BinaryCell, type BinaryPuzzle, type BinarySize, type PuzzleLevel,
} from "./index.js";

const SEEDS = Array.from({ length: 30 }, (_, i) => `seed-${i}`);
const filled = (g: readonly BinaryCell[]) => g.filter((v) => v !== null).length;
const beyondBasic = (p: BinaryPuzzle) => p.difficulty.techniques.some((t) => !BINARY_BASIC.includes(t));
const cache = new Map<string, BinaryPuzzle[]>();
const batch = (level: PuzzleLevel, size?: BinarySize) => {
  const key = `${level}|${size ?? ""}`;
  let list = cache.get(key);
  if (!list) { list = SEEDS.map((seed) => generateBinary(size ? { seed, level, size } : { seed, level })); cache.set(key, list); }
  return list;
};

describe.each(PUZZLE_LEVELS)("generateBinary niveau %s", (level) => {
  const s = BINARY_LEVELS[level];

  it(`heeft voor ${SEEDS.length} seeds een geldige, unieke oplossing`, () => {
    for (const p of batch(level)) {
      expect(p.size).toBe(s.size);
      expect(isValidBinary(p.solution, p.size)).toBe(true);
      p.givens.forEach((v, i) => { if (v !== null) expect(v).toBe(p.solution[i]); });
      expect(countBinarySolutions(p.givens, p.size, 5)).toBe(1);
      expect(solveBinary(p.givens, p.size)).toEqual(p.solution);
    }
  }, 60_000);

  it("is op te lossen met de technieken van het niveau", () => {
    for (const p of batch(level)) {
      const g = gradeBinary(p.givens, p.size, { techniques: s.techniques });
      expect(g.solved).toBe(true);
      expect(g.grid).toEqual(p.solution);
      if (s.techniques === "basic") expect(beyondBasic(p)).toBe(false);
      if (s.givenShare > 0) expect(filled(p.givens)).toBeLessThanOrEqual(Math.round(p.size * p.size * s.givenShare));
    }
  });
});

describe("binaire puzzel niveaus", () => {
  it("expert vraagt (bijna) altijd een techniek voorbij de basis", () => {
    expect(batch("expert").filter(beyondBasic).length / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it("advanced geeft minder hulp dan starter op hetzelfde formaat", () => {
    const share = (level: PuzzleLevel) => batch(level, 8).reduce((a, p) => a + filled(p.givens), 0) / SEEDS.length;
    expect(share("advanced")).toBeLessThan(share("starter"));
  });

  it.each([12, 14] as const)("maakt een %i×%i expert uniek en binnen een seconde", (size) => {
    for (let i = 0; i < 5; i++) {
      const started = Date.now();
      const p = generateBinary({ seed: `perf-${i}`, level: "expert", size });
      expect(Date.now() - started).toBeLessThan(1000);
      expect(countBinarySolutions(p.givens, size)).toBe(1);
    }
  }, 30_000);

  it("weigert een oneven of te groot formaat en een onbekend niveau", () => {
    expect(() => generateBinary({ seed: 1, level: "starter", size: 7 as BinarySize })).toThrow(RangeError);
    expect(() => generateBinary({ seed: 1, level: "starter", size: 16 as BinarySize })).toThrow(RangeError);
    expect(() => generateBinary({ seed: 1, level: "hard" as PuzzleLevel })).toThrow(RangeError);
  });
});

describe("regels en controle", () => {
  it("vindt drie op een rij, te veel van één cijfer en dubbele rijen", () => {
    const triple: BinaryCell[] = new Array<BinaryCell>(36).fill(null);
    triple[0] = 1; triple[1] = 1; triple[2] = 1;
    expect(binaryConflicts(triple, 6)).toEqual([0, 1, 2]);
    const rowA = [0, 0, 1, 0, 1, 1] as const, rowB = [1, 1, 0, 1, 0, 0] as const;
    const dup: BinaryCell[] = [...rowA, ...rowA, ...new Array<BinaryCell>(24).fill(null)];
    expect(binaryConflicts(dup, 6)).toEqual([...Array(12).keys()]);
    const fine: BinaryCell[] = [...rowA, ...rowB, ...new Array<BinaryCell>(24).fill(null)];
    expect(binaryConflicts(fine, 6)).toEqual([]);
  });

  it("controleert een invulling van een speler", () => {
    const p = generateBinary({ seed: "check", level: "starter" });
    expect(validateBinaryEntry(p.givens, p.solution, 6)).toEqual({ conflicts: [], changedGivens: [], complete: true, solved: true });
    expect(validateBinaryEntry(p.givens, p.givens, 6)).toMatchObject({ complete: false, solved: false });
    const entry = p.solution.slice() as BinaryCell[];
    const given = p.givens.findIndex((v) => v !== null);
    entry[given] = entry[given] === 1 ? 0 : 1;
    const check = validateBinaryEntry(p.givens, entry, 6);
    expect(check.changedGivens).toEqual([given]);
    expect(check.conflicts.length).toBeGreaterThan(0);
  });

  it("telt meerdere oplossingen bij een leeg rooster", () => {
    expect(countBinarySolutions(new Array<BinaryCell>(36).fill(null), 6, 3)).toBe(3);
    expect(gradeBinary(new Array<BinaryCell>(36).fill(null), 6).solved).toBe(false);
  });
});

describe("binaire puzzel determinisme", () => {
  it("geeft bij dezelfde opties dezelfde puzzel", () => {
    expect(generateBinary({ seed: "same", level: "expert" })).toEqual(generateBinary({ seed: "same", level: "expert" }));
  });

  it("blijft tussen versies gelijk (vaste puzzels)", () => {
    const show = (p: BinaryPuzzle) => p.givens.map((v) => (v === null ? "." : v)).join("");
    expect(show(generateBinary({ seed: "golden", level: "expert" }))).toBe(
      "0.1.........1...1......0...0.........00.....1.....0......0..0.....1.........1......0.0..1.11....11..",
    );
    expect(show(generateBinary({ seed: "golden", level: "starter" }))).toBe("1....0..0101..00.110..1..1.10.0.1..0");
  });
});
