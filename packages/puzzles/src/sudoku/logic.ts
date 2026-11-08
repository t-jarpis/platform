import { assertGrid, geometry, popcount, type Geometry, type SudokuSize } from "./grid.js";

/**
 * Technieken die de menselijke oplosser kent, van makkelijk naar moeilijk.
 * - `hidden-single`: een cijfer kan in een rij, kolom of vak nog maar op één plek.
 * - `naked-single`: een vakje heeft nog maar één mogelijk cijfer.
 * - `pointing-pair`: binnen een vak staat een cijfer alleen nog in één rij/kolom; elders in die rij/kolom valt het af.
 * - `box-line`: binnen een rij/kolom staat een cijfer alleen nog in één vak; elders in dat vak valt het af.
 * - `naked-pair`: twee vakjes in een eenheid met dezelfde twee kandidaten; die vallen elders in de eenheid af.
 * - `hidden-pair`: twee cijfers passen in een eenheid alleen in dezelfde twee vakjes; andere kandidaten daar vallen af.
 */
export type Technique = "hidden-single" | "naked-single" | "pointing-pair" | "box-line" | "naked-pair" | "hidden-pair";

export const TECHNIQUES: readonly Technique[] = ["hidden-single", "naked-single", "pointing-pair", "box-line", "naked-pair", "hidden-pair"];

/** Technieken die alleen een cijfer invullen; al het andere is "verder dan singles". */
export const SINGLES: readonly Technique[] = ["hidden-single", "naked-single"];

/** Punten per keer dat een techniek nodig is. De score is de som over alle stappen. */
export const TECHNIQUE_WEIGHTS: Readonly<Record<Technique, number>> = {
  "hidden-single": 1,
  "naked-single": 2,
  "pointing-pair": 10,
  "box-line": 10,
  "naked-pair": 15,
  "hidden-pair": 20,
};

export interface Grade {
  /** Helemaal op te lossen met de toegestane technieken (en dus precies één oplossing). */
  solved: boolean;
  /** Som van `TECHNIQUE_WEIGHTS` over alle stappen. */
  score: number;
  /** Gebruikte technieken, in volgorde van moeilijkheid. */
  techniques: Technique[];
  /** Rooster zo ver als de logica kwam (0 = nog leeg). */
  grid: number[];
}

export interface GradeOptions {
  /** `"singles"`: alleen hidden en naked singles. `"all"` (standaard): alle technieken. */
  techniques?: "singles" | "all";
}

/**
 * Lost op zoals een mens: telkens de makkelijkste techniek die iets oplevert. Elke stap is een
 * logisch gevolg, dus als dit lukt heeft de puzzel precies één oplossing.
 */
export function gradeSudoku(givens: readonly number[], size: SudokuSize, options: GradeOptions = {}): Grade {
  assertGrid(givens, size);
  return grade(givens, geometry(size), options.techniques !== "singles");
}

export function grade(givens: readonly number[], geo: Geometry, advanced: boolean): Grade {
  const { size, cells, peers, units, rows, cols, boxes, rowOf, colOf, boxOf } = geo;
  const grid = givens.slice();
  const cand = new Array<number>(cells).fill((1 << size) - 1);
  const used = new Set<Technique>();
  let score = 0;
  let filled = 0;
  const unsolved = (): Grade => ({ solved: false, score, techniques: ordered(used), grid });

  const place = (i: number, v: number): boolean => {
    const bit = 1 << (v - 1);
    if (!((cand[i] ?? 0) & bit)) return false; // botsing
    grid[i] = v;
    cand[i] = 0;
    filled++;
    for (const p of peers[i] ?? []) cand[p] = (cand[p] ?? 0) & ~bit;
    return true;
  };
  const record = (t: Technique) => { used.add(t); score += TECHNIQUE_WEIGHTS[t]; };
  /** Haalt `mask` weg uit de vakjes in `targets`; true als er iets veranderde. */
  const eliminate = (targets: Iterable<number>, mask: number): boolean => {
    let changed = false;
    for (const i of targets) {
      const c = cand[i] ?? 0;
      if (c & mask) { cand[i] = c & ~mask; changed = true; }
    }
    return changed;
  };

  for (let i = 0; i < cells; i++) {
    const v = grid[i] ?? 0;
    if (v !== 0) { grid[i] = 0; if (!place(i, v)) return unsolved(); }
  }

  const scanOrder = [...boxes, ...rows, ...cols];
  const lines = [...rows, ...cols];
  const hiddenSingle = (): boolean => {
    for (const unit of scanOrder) {
      for (let v = 1; v <= size; v++) {
        const bit = 1 << (v - 1);
        let spot = -1, n = 0;
        for (const i of unit) if ((cand[i] ?? 0) & bit) { spot = i; if (++n > 1) break; }
        if (n === 1) { place(spot, v); return true; }
      }
    }
    return false;
  };
  const nakedSingle = (): boolean => {
    for (let i = 0; i < cells; i++) {
      const c = cand[i] ?? 0;
      if (grid[i] === 0 && c && (c & (c - 1)) === 0) { place(i, Math.log2(c) + 1); return true; }
    }
    return false;
  };
  /** Pointing (vak → lijn) en box-line (lijn → vak). */
  const intersections = (): Technique | null => {
    for (let v = 1; v <= size; v++) {
      const bit = 1 << (v - 1);
      for (const box of boxes) {
        const spots = box.filter((i) => (cand[i] ?? 0) & bit);
        if (spots.length < 2) continue;
        const first = spots[0] ?? 0;
        for (const [lineOf, group] of [[rowOf, rows], [colOf, cols]] as const) {
          const line = lineOf[first] ?? 0;
          if (!spots.every((i) => lineOf[i] === line)) continue;
          if (eliminate((group[line] ?? []).filter((i) => boxOf[i] !== boxOf[first]), bit)) return "pointing-pair";
        }
      }
      for (const line of lines) {
        const spots = line.filter((i) => (cand[i] ?? 0) & bit);
        if (spots.length < 2) continue;
        const b = boxOf[spots[0] ?? 0] ?? 0;
        if (!spots.every((i) => boxOf[i] === b)) continue;
        if (eliminate((boxes[b] ?? []).filter((i) => !line.includes(i)), bit)) return "box-line";
      }
    }
    return null;
  };
  const nakedPair = (): boolean => {
    for (const unit of units) {
      const open = unit.filter((i) => popcount(cand[i] ?? 0) === 2);
      for (let a = 0; a < open.length; a++) {
        for (let b = a + 1; b < open.length; b++) {
          const ia = open[a] ?? 0, ib = open[b] ?? 0;
          const mask = cand[ia] ?? 0;
          if (mask !== cand[ib]) continue;
          if (eliminate(unit.filter((i) => i !== ia && i !== ib), mask)) return true;
        }
      }
    }
    return false;
  };
  const hiddenPair = (): boolean => {
    for (const unit of units) {
      // Per cijfer: bitmasker van posities binnen de eenheid.
      const where = Array.from({ length: size }, (_, k) => unit.reduce((m, i, pos) => ((cand[i] ?? 0) & (1 << k) ? m | (1 << pos) : m), 0));
      for (let a = 0; a < size; a++) {
        const pa = where[a] ?? 0;
        if (popcount(pa) !== 2) continue;
        for (let b = a + 1; b < size; b++) {
          if (where[b] !== pa) continue;
          const keep = (1 << a) | (1 << b);
          const targets = unit.filter((_, pos) => pa & (1 << pos));
          if (eliminate(targets, ~keep & ((1 << size) - 1))) return true;
        }
      }
    }
    return false;
  };

  while (filled < cells) {
    for (let i = 0; i < cells; i++) if (grid[i] === 0 && cand[i] === 0) return unsolved(); // tegenspraak
    if (hiddenSingle()) { record("hidden-single"); continue; }
    if (nakedSingle()) { record("naked-single"); continue; }
    if (!advanced) return unsolved();
    const inter = intersections();
    if (inter) { record(inter); continue; }
    if (nakedPair()) { record("naked-pair"); continue; }
    if (hiddenPair()) { record("hidden-pair"); continue; }
    return unsolved();
  }
  return { solved: true, score, techniques: ordered(used), grid };
}

function ordered(used: Set<Technique>): Technique[] {
  return TECHNIQUES.filter((t) => used.has(t));
}
