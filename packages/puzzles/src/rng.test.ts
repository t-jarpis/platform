import { describe, expect, it } from "vitest";
import { createRng } from "./index.js";

const take = (seed: string | number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("createRng", () => {
  it("geeft bij dezelfde seed dezelfde reeks", () => {
    expect(take("abc", 50)).toEqual(take("abc", 50));
  });

  it("geeft bij andere seeds een andere reeks", () => {
    expect(take("abc", 5)).not.toEqual(take("abd", 5));
    expect(take(1, 5)).not.toEqual(take(2, 5));
  });

  it("behandelt getal en tekst gelijk", () => {
    expect(take(42, 5)).toEqual(take("42", 5));
  });

  it("blijft tussen versies gelijk (vaste waarden)", () => {
    const rng = createRng("golden");
    expect(Array.from({ length: 6 }, () => rng.int(1000))).toEqual(GOLDEN_INTS);
  });

  it("int(n) blijft binnen [0, n) en raakt alle waarden", () => {
    const rng = createRng("int");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  it("shuffle geeft een permutatie en laat het origineel heel", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng("s").shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it("pick kiest een element uit de lijst", () => {
    const rng = createRng("p");
    for (let i = 0; i < 20; i++) expect(["a", "b", "c"]).toContain(rng.pick(["a", "b", "c"]));
  });

  it("weigert ongeldige invoer", () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(1.5)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

const GOLDEN_INTS = [669, 938, 350, 297, 285, 404];
