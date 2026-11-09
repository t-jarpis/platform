import { describe, expect, it } from "vitest";
import {
  checkWordSearchFind, countWordOccurrences, FORWARD_DIRECTIONS, generateWordSearch, PUZZLE_LEVELS, WORD_SEARCH_LEVELS,
  type PuzzleLevel, type WordSearch,
} from "./index.js";

const SEEDS = Array.from({ length: 30 }, (_, i) => `seed-${i}`);
const WORDS = ["Appel", "peer", "BANAAN", "kiwi", "mango", "druif", "citroen", "meloen", "pruim", "kers"];
const VECTORS = { E: [1, 0], S: [0, 1], SE: [1, 1], NE: [1, -1], W: [-1, 0], N: [0, -1], NW: [-1, -1], SW: [-1, 1] } as const;

const spelled = (p: WordSearch, i: number) => {
  const pl = p.placements[i]!;
  const [dx, dy] = VECTORS[pl.direction];
  return [...pl.word].map((_, k) => p.grid[(pl.start.y + dy * k) * p.width + pl.start.x + dx * k]).join("");
};

describe.each(PUZZLE_LEVELS)("generateWordSearch niveau %s", (level: PuzzleLevel) => {
  const puzzles = SEEDS.map((seed) => generateWordSearch({ seed, level, words: WORDS }));

  it("plaatst elk woord precies één keer, in een toegestane richting", () => {
    for (const p of puzzles) {
      expect(p.placements.map((pl) => pl.input)).toEqual(WORDS);
      p.placements.forEach((pl, i) => {
        expect(spelled(p, i)).toBe(pl.word);
        expect(WORD_SEARCH_LEVELS[level].directions).toContain(pl.direction);
      });
      // In alle acht richtingen geteld: geen extra exemplaren door vulletters.
      expect(countWordOccurrences(p)).toEqual(WORDS.map(() => 1));
    }
  });

  it("vult alle vakjes met letters uit het alfabet en heeft het formaat van het niveau", () => {
    for (const p of puzzles) {
      expect(p.grid).toHaveLength(p.width * p.height);
      expect(p.grid.every((l) => /^[A-Z]$/.test(l))).toBe(true);
      expect(p.width).toBeGreaterThanOrEqual(WORD_SEARCH_LEVELS[level].size);
    }
  });
});

describe("woordzoeker niveaus", () => {
  it("starter is klein, alleen horizontaal en verticaal; expert gebruikt ook achterstevoren", () => {
    const starter = generateWordSearch({ seed: 1, level: "starter", words: WORDS });
    expect(starter.width).toBe(8);
    expect(starter.placements.every((p) => p.direction === "E" || p.direction === "S")).toBe(true);
    const expert = SEEDS.map((seed) => generateWordSearch({ seed, level: "expert", words: WORDS }));
    expect(expert[0]!.width).toBe(15);
    const backwards = expert.flatMap((p) => p.placements).filter((p) => !FORWARD_DIRECTIONS.includes(p.direction)).length;
    expect(backwards).toBeGreaterThan(0);
  });

  it("maakt het rooster groter voor een lang woord, maar weigert een te klein vast formaat", () => {
    expect(generateWordSearch({ seed: 1, level: "starter", words: ["VERJAARDAGSTAART"] }).width).toBeGreaterThanOrEqual(16);
    expect(() => generateWordSearch({ seed: 1, level: "starter", words: ["VERJAARDAGSTAART"], size: 8 })).toThrow(RangeError);
  });

  it("respecteert eigen richtingen, formaat en alfabet", () => {
    const p = generateWordSearch({ seed: 2, level: "starter", words: ["ABBA", "BAB"], size: { width: 6, height: 5 }, directions: ["S"], alphabet: "ABC" });
    expect([p.width, p.height]).toEqual([6, 5]);
    expect(p.placements.every((pl) => pl.direction === "S")).toBe(true);
    expect(p.grid.every((l) => "ABC".includes(l))).toBe(true);
    expect(countWordOccurrences(p)).toEqual([1, 1]);
  });

  it("weigert lege, dubbele, ingesloten of onmogelijke woorden", () => {
    expect(() => generateWordSearch({ seed: 1, level: "starter", words: [] })).toThrow(RangeError);
    expect(() => generateWordSearch({ seed: 1, level: "starter", words: ["kat", "KAT"] })).toThrow(RangeError);
    expect(() => generateWordSearch({ seed: 1, level: "starter", words: ["kat", "katten"] })).toThrow(RangeError);
    expect(() => generateWordSearch({ seed: 1, level: "starter", words: ["net", "ten"] })).toThrow(RangeError);
    expect(() => generateWordSearch({ seed: 1, level: "starter", words: ["café"] })).toThrow(RangeError);
    expect(() => generateWordSearch({ seed: 1, level: "starter", words: ["a"] })).toThrow(RangeError);
    expect(() => generateWordSearch({ seed: 1, level: "nightmare" as PuzzleLevel, words: ["kat"] })).toThrow(RangeError);
  });

  it("haalt spaties en streepjes weg", () => {
    const p = generateWordSearch({ seed: 1, level: "starter", words: ["ijs-taart", "zee leeuw"] });
    expect(p.placements.map((pl) => pl.word)).toEqual(["IJSTAART", "ZEELEEUW"]);
  });
});

describe("checkWordSearchFind", () => {
  const p = generateWordSearch({ seed: "find", level: "expert", words: WORDS });
  it("vindt een woord in beide sleeprichtingen", () => {
    const pl = p.placements[3]!;
    expect(checkWordSearchFind(p, pl.start, pl.end)).toEqual({ found: true, word: "KIWI", index: 3 });
    expect(checkWordSearchFind(p, pl.end, pl.start)).toEqual({ found: true, word: "KIWI", index: 3 });
  });
  it("weigert een verkeerde selectie", () => {
    const pl = p.placements[0]!;
    expect(checkWordSearchFind(p, pl.start, pl.start)).toEqual({ found: false });
  });
});

describe("woordzoeker determinisme", () => {
  it("geeft bij dezelfde opties hetzelfde rooster en anders bij een andere seed", () => {
    const a = generateWordSearch({ seed: "same", level: "advanced", words: WORDS });
    expect(generateWordSearch({ seed: "same", level: "advanced", words: WORDS })).toEqual(a);
    expect(generateWordSearch({ seed: "other", level: "advanced", words: WORDS }).grid).not.toEqual(a.grid);
  });

  it("blijft tussen versies gelijk (vaste puzzels)", () => {
    const words = ["APPEL", "PEER", "BANAAN", "KIWI", "MANGO", "DRUIF"];
    const expert = generateWordSearch({ seed: "golden", level: "expert", words });
    expect(expert.grid.join("")).toBe(
      "SFAPWPOETNZCONIZFYWJKFIZFIURDOGGDGIYCYVRNIMLGBTCWIHBFVNZEZBGQYIGJVKPIQDBDPLLJAJOREEPNMCEBOIWEEDAUANCYMHHBQPPBNPEFCQASAUBUKMHGWZXINNRIKAWBMPPCHZGBLFRINJTZGDTLOSLMDSTAMVOVEEEEOERUXJAVZNHOLPQOAIXDMNSXCIDEPVLPFNYDQKSPIUQAUQHGPMTU",
    );
    expect(expert.placements.map((p) => `${p.word}@${p.start.x},${p.start.y}${p.direction}`).join(" ")).toBe(
      "APPEL@6,14N PEER@8,5W BANAAN@14,7S KIWI@5,1SW MANGO@11,6SW DRUIF@13,1W",
    );
    expect(generateWordSearch({ seed: "golden", level: "starter", words }).grid.join("")).toBe(
      "RTAPPELPSQMRSITEDRUIFDCEORDOOQARIBBANAANMANGOXZVEQDBUDFQYKIWIACI",
    );
  });
});
