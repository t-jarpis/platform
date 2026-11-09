import { describe, expect, it } from "vitest";
import {
  checkSleuthAnswer, checkSleuthSolution, countSleuthSolutions, generateSleuth, PUZZLE_LEVELS, SLEUTH_LEVELS, solveSleuth,
  type PuzzleLevel, type SleuthPuzzle,
} from "./index.js";

const SEEDS = Array.from({ length: 30 }, (_, i) => `seed-${i}`);
const cache = new Map<PuzzleLevel, SleuthPuzzle[]>();
const batch = (level: PuzzleLevel) => {
  let list = cache.get(level);
  if (!list) { list = SEEDS.map((seed) => generateSleuth({ seed, level })); cache.set(level, list); }
  return list;
};

describe.each(PUZZLE_LEVELS)("generateSleuth niveau %s", (level) => {
  const s = SLEUTH_LEVELS[level];

  it(`heeft voor ${SEEDS.length} seeds precies één oplossing, gelijk aan solution`, () => {
    for (const p of batch(level)) {
      expect(countSleuthSolutions(p, 10)).toBe(1);
      expect(solveSleuth(p)).toEqual(p.solution);
      expect(checkSleuthSolution(p, p.solution)).toEqual({ ruleConflicts: [], brokenClues: [], solved: true });
    }
  }, 60_000);

  it("volgt de regels: formaat, figuren in eigen rij en kolom, niet op obstakels", () => {
    for (const p of batch(level)) {
      expect(p.size).toBe(s.size);
      expect(p.figureCount).toBeGreaterThanOrEqual(s.figures[0]);
      expect(p.figureCount).toBeLessThanOrEqual(s.figures[1]);
      expect(new Set(p.rooms).size).toBe(p.roomCount);
      expect(new Set(p.solution.map((c) => Math.floor(c / p.size))).size).toBe(p.figureCount);
      expect(new Set(p.solution.map((c) => c % p.size)).size).toBe(p.figureCount);
      expect(p.solution.some((c) => p.obstacles.includes(c))).toBe(false);
    }
  });

  it("heeft samenhangende kamers", () => {
    for (const p of batch(level)) {
      for (let r = 0; r < p.roomCount; r++) {
        const cells = p.rooms.flatMap((v, i) => (v === r ? [i] : []));
        const seen = new Set([cells[0]!]);
        const stack = [cells[0]!];
        while (stack.length) {
          const i = stack.pop()!;
          const x = i % p.size;
          for (const n of [i - p.size, i + p.size, x > 0 ? i - 1 : -1, x < p.size - 1 ? i + 1 : -1]) {
            if (n >= 0 && p.rooms[n] === r && !seen.has(n)) { seen.add(n); stack.push(n); }
          }
        }
        expect(seen.size).toBe(cells.length);
      }
    }
  });

  it("stelt een vraag met precies één figuur in de kamer en verraadt die kamer niet direct", () => {
    for (const p of batch(level)) {
      const inRoom = p.solution.flatMap((c, f) => (p.rooms[c] === p.question.room ? [f] : []));
      expect(inRoom).toEqual([p.answer.figure]);
      expect(p.clues.some((c) => c.type === "in-room" && c.room === p.question.room)).toBe(false);
      expect(checkSleuthAnswer(p, p.answer.figure)).toBe(true);
      expect(checkSleuthAnswer(p, (p.answer.figure + 1) % p.figureCount)).toBe(false);
    }
  });

  it("gebruikt alleen aanwijzingen van het niveau en geen overbodige", () => {
    const allowed = s.tiers.flat();
    for (const p of batch(level)) {
      expect(p.clues.every((c) => allowed.includes(c.type))).toBe(true);
      p.clues.forEach((_, i) => {
        expect(countSleuthSolutions({ ...p, clues: p.clues.filter((_, j) => j !== i) }, 2)).toBe(2);
      });
    }
  }, 60_000);
});

describe("speurpuzzel niveaus", () => {
  it("expert gebruikt vooral relaties en zelden rij of kolom", () => {
    const clues = batch("expert").flatMap((p) => p.clues);
    const relational = clues.filter((c) => c.type === "touching" || c.type === "left-of" || c.type === "above").length;
    const direct = clues.filter((c) => c.type === "in-row" || c.type === "in-column").length;
    expect(relational).toBeGreaterThan(direct);
  });

  it("maakt een 8×8 expert binnen een seconde", () => {
    for (let i = 0; i < 10; i++) {
      const started = Date.now();
      generateSleuth({ seed: `perf-${i}`, level: "expert" });
      expect(Date.now() - started).toBeLessThan(1000);
    }
  }, 30_000);
});

describe("checkSleuthSolution", () => {
  const p = generateSleuth({ seed: "check", level: "advanced" });
  it("meldt figuren in dezelfde rij en gebroken aanwijzingen", () => {
    const cells = p.solution.slice();
    cells[1] = Math.floor(cells[0]! / p.size) * p.size + (cells[1]! % p.size); // figuur 1 naar de rij van figuur 0
    const check = checkSleuthSolution(p, cells);
    expect(check.ruleConflicts).toEqual(expect.arrayContaining([0, 1]));
    expect(check.solved).toBe(false);
  });
  it("weigert een opstelling met het verkeerde aantal figuren", () => {
    expect(() => checkSleuthSolution(p, [0])).toThrow(RangeError);
  });
});

describe("speurpuzzel determinisme", () => {
  it("geeft bij dezelfde opties dezelfde puzzel", () => {
    expect(generateSleuth({ seed: "same", level: "expert" })).toEqual(generateSleuth({ seed: "same", level: "expert" }));
  });

  it("blijft tussen versies gelijk (vaste puzzel)", () => {
    const p = generateSleuth({ seed: "golden", level: "advanced" });
    expect(p.rooms.join("")).toBe("000011022001332222333444333555555555");
    expect(p.obstacles).toEqual([3, 30, 31, 34]);
    expect(p.windows).toEqual([17, 23, 32]);
    expect(p.solution).toEqual([14, 24, 21, 35, 1]);
    expect(p.question).toEqual({ room: 0 });
    expect(p.answer).toEqual({ figure: 4 });
    expect(p.clues).toHaveLength(12);
  });
});
