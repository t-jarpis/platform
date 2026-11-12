import { delta, num } from "./format.js";

/**
 * Kerncijfer met de verandering t.o.v. de vorige periode. `upIsGood` bepaalt de kleur (goed of slecht), niet
 * de richting; de richting staat er ook als teken en tekst, niet alleen als kleur.
 * `trend`: de reeks per dag (of week) over de periode; vanaf twee punten een sparkline onder de vergelijking.
 */
export function StatCard({ label, value, before, period, upIsGood = true, note, format = num, trend }: {
  label: string;
  value: number;
  /** Waarde in de vorige periode; leeg = geen vergelijking tonen. */
  before?: number;
  /** "vorige 30 dagen". */
  period?: string;
  upIsGood?: boolean;
  note?: string;
  format?: (n: number) => string;
  /** Reeks per dag of week over de periode (dezelfde als de tijdlijn), voor de sparkline. */
  trend?: number[];
}) {
  const d = before === undefined ? null : delta(value, before);
  const dir = !d || d.pct === null || d.pct === 0 ? undefined : (d.pct > 0) === upIsGood ? "good" : "bad";
  const vs = period ? <span> t.o.v. {period}</span> : null;
  return (
    <div className="ui-stat">
      <span className="ui-stat-label">{label}</span>
      <strong>{format(value)}</strong>
      {d && (d.pct !== null
        ? <p className="ui-stat-delta" data-dir={dir}><b>{d.pct > 0 ? "▲" : d.pct < 0 ? "▼" : "="} {d.pct > 0 ? "+" : ""}{d.pct}%</b>{vs}</p>
        : <p className="ui-stat-delta"><b>{d.isNew ? "nieuw" : "geen vergelijking"}</b>{vs}</p>)}
      {trend && trend.length > 1 && <Sparkline values={trend} format={format} />}
      {note && <p className="ui-stat-note">{note}</p>}
    </div>
  );
}

const SW = 100, SH = 36, PAD = 2;

/** Alleen de vorm van het verloop: y van 0 tot het hoogste punt, geen assen. */
export function Sparkline({ values, format = num }: { values: number[]; format?: (n: number) => string }) {
  const max = Math.max(...values, 0);
  const x = (i: number) => (SW * i) / (values.length - 1);
  const y = (v: number) => (max ? PAD + (SH - PAD) * (1 - v / max) : SH);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const label = `Per periode: van ${format(values[0] ?? 0)} naar ${format(values.at(-1) ?? 0)}, hoogste ${format(max)}`;
  return (
    <svg className="ui-stat-spark" viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="ui-stat-spark-area" d={`M0 ${SH} ${line.replace(/^M/, "L")} L${SW} ${SH} Z`} />
      <path className="ui-stat-spark-line" d={line} />
    </svg>
  );
}
