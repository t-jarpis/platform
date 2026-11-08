/** Een seed: tekst of getal. Het getal `42` en de tekst `"42"` geven dezelfde reeks. */
export type Seed = string | number;

/** Deterministische toevalsgenerator. Zelfde seed geeft overal (Node, browser, edge) dezelfde reeks. */
export interface Rng {
  /** Volgend getal in [0, 1). */
  next(): number;
  /** Geheel getal in [0, n). */
  int(n: number): number;
  /** Willekeurig element uit een niet-lege lijst. */
  pick<T>(items: readonly T[]): T;
  /** Nieuwe, geschudde kopie van de lijst (Fisher-Yates); het origineel blijft ongemoeid. */
  shuffle<T>(items: readonly T[]): T[];
}

/** xmur3: maakt van een tekst een reeks 32-bits seeds. */
function xmur3(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/**
 * Maakt een generator op basis van sfc32, geseed via xmur3. Alleen 32-bits integer-rekenwerk
 * (`Math.imul`, bitoperaties), dus de uitkomst is op elk platform gelijk.
 */
export function createRng(seed: Seed): Rng {
  const hash = xmur3(String(seed));
  let a = hash();
  let b = hash();
  let c = hash();
  let d = hash();

  const next = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Eerste uitkomsten weggooien: sfc32 mengt dan beter bij seeds die op elkaar lijken.
  for (let i = 0; i < 12; i++) next();

  const int = (n: number): number => {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`int(n) verwacht een positief geheel getal, kreeg ${n}`);
    return Math.floor(next() * n);
  };

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("pick() op een lege lijst");
      return items[int(items.length)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
  };
}
