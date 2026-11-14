import { assertLevel, type PuzzleLevel } from "./level.js";
import { createRng, type Seed } from "./rng.js";

/**
 * Lampjespuzzel: tik een lampje en het wisselt mee met zijn buren erboven, eronder, links en rechts. Zet alle
 * lampjes uit. De puzzel komt uit een uitgezet rooster met een paar tikken, dus hij is altijd op te lossen.
 * Eigen generator en eigen naam.
 */
export interface LightsPuzzle {
  size: number;
  /** `true` = lampje aan. */
  start: boolean[];
  /** Een oplossing: de vakjes om één keer op te tikken (er kunnen meer oplossingen zijn). */
  presses: number[];
  level: PuzzleLevel;
  seed: Seed;
}

interface LightsSettings { size: number; presses: number }

export const LIGHTS_LEVELS: Readonly<Record<PuzzleLevel, LightsSettings>> = {
  starter: { size: 3, presses: 2 },
  "large-print": { size: 4, presses: 3 },
  advanced: { size: 5, presses: 6 },
  expert: { size: 6, presses: 10 },
};

export interface LightsOptions { seed: Seed; level: PuzzleLevel }

/** Tikken op vakje i: het vakje en zijn rechte buren wisselen. Geeft een nieuw rooster. */
export function pressLight(size: number, lights: readonly boolean[], i: number): boolean[] {
  const out = lights.slice();
  const r = Math.floor(i / size), c = i % size;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && cc >= 0 && rr < size && cc < size) out[rr * size + cc] = !out[rr * size + cc];
  }
  return out;
}

export function generateLights(options: LightsOptions): LightsPuzzle {
  const { seed, level } = options;
  assertLevel(level);
  const { size, presses: count } = LIGHTS_LEVELS[level];
  const rng = createRng(`lights|${level}|${seed}`);
  for (;;) {
    const presses = rng.shuffle(Array.from({ length: size * size }, (_, i) => i)).slice(0, count).sort((a, b) => a - b);
    let start = new Array<boolean>(size * size).fill(false);
    for (const i of presses) start = pressLight(size, start, i);
    if (start.some(Boolean)) return { size, start, presses, level, seed };
  }
}
