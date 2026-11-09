import type { CSSProperties } from "react";
import { num } from "./format.js";

/** Aantal per weekdag (1 = maandag, 7 = zondag) en uur (0–23), zoals `activity()` van `@t-jarpis/analytics` geeft. */
export interface ActivityCell { weekday: number; hour: number; count: number }

const DAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const DAY_NAMES = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Tabel weekdag × uur: hoe donkerder, hoe vaker. Schermlezers krijgen per cel de dag, het uur en het aantal. */
export function ActivityHeatmap({ grid, caption, empty = "Nog geen gegevens in deze periode.", days = DAYS, dayNames = DAY_NAMES, legend = ["Minder", "Meer"] }: {
  grid: ActivityCell[];
  caption: string;
  empty?: string;
  /** Korte namen, maandag eerst. */
  days?: readonly string[];
  /** Volledige namen, maandag eerst. */
  dayNames?: readonly string[];
  legend?: readonly [string, string];
}) {
  const at = new Map(grid.map((c) => [`${c.weekday}-${c.hour}`, c.count]));
  const max = Math.max(1, ...grid.map((c) => c.count));
  if (!grid.some((c) => c.count > 0)) return <p className="ui-muted">{empty}</p>;
  return (
    <>
      <table className="ui-heatmap">
        <caption className="ui-visually-hidden">{caption}</caption>
        <thead><tr><th scope="col"><span className="ui-visually-hidden">Dag</span></th>{HOURS.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{days.map((d, i) => (
          <tr key={d}><th scope="row" title={dayNames[i]}>{d}</th>{HOURS.map((h) => {
            const n = at.get(`${i + 1}-${h}`) ?? 0;
            const label = `${dayNames[i] ?? d} ${h}:00–${h + 1}:00: ${num(n)}`;
            return <td key={h} title={label} {...(n ? { style: { "--heat": (n / max).toFixed(2) } as CSSProperties } : { "data-zero": "" })}><span className="ui-visually-hidden">{label}</span></td>;
          })}</tr>
        ))}</tbody>
      </table>
      <div className="ui-heatmap-legend" aria-hidden="true">{legend[0]} {[0, 0.25, 0.5, 0.75, 1].map((v) => <i key={v} style={{ "--heat": v } as CSSProperties} />)} {legend[1]}</div>
    </>
  );
}
