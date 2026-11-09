/** Een lineaire vergelijking: som van `coeffs[k] * value[cells[k]]` is `total`. */
export interface Equation {
  cells: readonly number[];
  coeffs: readonly number[];
  total: number;
}

export interface Propagation {
  /** Alle vakjes zijn gevonden. Omdat elke stap een gevolg is, betekent dit: precies één oplossing. */
  solved: boolean;
  /** Waarden zo ver als het lukte; `null` = nog onbekend. */
  values: (number | null)[];
  /** Aantal stappen (ingevulde vakjes). */
  steps: number;
  /** Een vergelijking klopte niet of gaf geen geheel getal. */
  contradiction: boolean;
}

/**
 * Lost op zoals een mens: zoek een vergelijking met nog maar één onbekende en reken die uit.
 * Herhaalt tot alles bekend is of niets meer lukt.
 */
export function propagate(equations: readonly Equation[], start: readonly (number | null)[]): Propagation {
  const values = start.slice();
  let steps = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (const eq of equations) {
      let unknown = -1, coeff = 0, rest = eq.total, open = 0;
      eq.cells.forEach((c, k) => {
        const v = values[c];
        const a = eq.coeffs[k] ?? 0;
        if (v === null || v === undefined) { open++; unknown = c; coeff = a; } else rest -= a * v;
      });
      if (open === 0) {
        if (rest !== 0) return { solved: false, values, steps, contradiction: true };
        continue;
      }
      if (open !== 1) continue;
      const v = rest / coeff;
      if (!Number.isInteger(v)) return { solved: false, values, steps, contradiction: true };
      values[unknown] = v;
      steps++;
      progress = true;
    }
  }
  return { solved: values.every((v) => v !== null), values, steps, contradiction: false };
}
