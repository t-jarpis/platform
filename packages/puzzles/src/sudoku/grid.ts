/** Ondersteunde sudokuformaten: 4×4 (vakken 2×2), 6×6 (vakken 2×3) en 9×9 (vakken 3×3). */
export type SudokuSize = 4 | 6 | 9;

/** Afmeting van één vak (blok) in rijen en kolommen. */
export interface Box {
  rows: number;
  cols: number;
}

/** Vaste meetkunde van een formaat: welke vakjes samen een rij, kolom of vak vormen. */
export interface Geometry {
  size: SudokuSize;
  box: Box;
  cells: number;
  /** Alle eenheden: eerst rijen, dan kolommen, dan vakken. */
  units: number[][];
  rows: number[][];
  cols: number[][];
  boxes: number[][];
  rowOf: number[];
  colOf: number[];
  boxOf: number[];
  /** Per vakje alle andere vakjes in dezelfde rij, kolom of vak. */
  peers: number[][];
}

const BOXES: Record<SudokuSize, Box> = {
  4: { rows: 2, cols: 2 },
  6: { rows: 2, cols: 3 },
  9: { rows: 3, cols: 3 },
};

/** Vakafmeting voor een formaat. */
export function boxFor(size: SudokuSize): Box {
  const box = BOXES[size];
  if (!box) throw new RangeError(`Onbekend sudokuformaat ${String(size)}; kies 4, 6 of 9`);
  return { ...box };
}

const cache = new Map<SudokuSize, Geometry>();

export function geometry(size: SudokuSize): Geometry {
  const hit = cache.get(size);
  if (hit) return hit;
  const box = boxFor(size);
  const cells = size * size;
  const stacks = size / box.cols;
  const rowOf: number[] = [];
  const colOf: number[] = [];
  const boxOf: number[] = [];
  const rows: number[][] = Array.from({ length: size }, () => []);
  const cols: number[][] = Array.from({ length: size }, () => []);
  const boxes: number[][] = Array.from({ length: size }, () => []);
  for (let i = 0; i < cells; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    const b = Math.floor(r / box.rows) * stacks + Math.floor(c / box.cols);
    rowOf.push(r); colOf.push(c); boxOf.push(b);
    (rows[r] as number[]).push(i);
    (cols[c] as number[]).push(i);
    (boxes[b] as number[]).push(i);
  }
  const peers = Array.from({ length: cells }, (_, i) => {
    const set = new Set([...(rows[rowOf[i] ?? 0] ?? []), ...(cols[colOf[i] ?? 0] ?? []), ...(boxes[boxOf[i] ?? 0] ?? [])]);
    set.delete(i);
    return [...set];
  });
  const geo: Geometry = { size, box, cells, units: [...rows, ...cols, ...boxes], rows, cols, boxes, rowOf, colOf, boxOf, peers };
  cache.set(size, geo);
  return geo;
}

/** Controleert vorm en waarden van een rooster (rij voor rij, 0 = leeg). */
export function assertGrid(grid: readonly number[], size: SudokuSize): void {
  const geo = geometry(size);
  if (grid.length !== geo.cells) throw new RangeError(`Rooster van ${size}×${size} moet ${geo.cells} vakjes hebben, kreeg ${grid.length}`);
  for (const v of grid) {
    if (!Number.isInteger(v) || v < 0 || v > size) throw new RangeError(`Ongeldige waarde ${v}; verwacht 0 tot en met ${size}`);
  }
}

export function popcount(mask: number): number {
  let n = 0;
  while (mask) { mask &= mask - 1; n++; }
  return n;
}

/** Waarden (1-based) in een kandidatenmasker. */
export function maskValues(mask: number): number[] {
  const out: number[] = [];
  for (let v = 1; mask; v++, mask >>= 1) if (mask & 1) out.push(v);
  return out;
}
