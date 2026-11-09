import { delta, num } from "./format.js";

/**
 * Kerncijfer met de verandering t.o.v. de vorige periode. `upIsGood` bepaalt de kleur (goed of slecht), niet
 * de richting; de richting staat er ook als teken en tekst, niet alleen als kleur.
 */
export function StatCard({ label, value, before, period, upIsGood = true, note, format = num }: {
  label: string;
  value: number;
  /** Waarde in de vorige periode; leeg = geen vergelijking tonen. */
  before?: number;
  /** "vorige 30 dagen". */
  period?: string;
  upIsGood?: boolean;
  note?: string;
  format?: (n: number) => string;
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
      {note && <p className="ui-stat-note">{note}</p>}
    </div>
  );
}
