import type { CSSProperties } from "react";
import { num, percent } from "./format.js";

export interface BarListItem { label: string; value: number }

/** Ranglijst met balken: hooguit `max` regels, de rest samen als `otherLabel`, met het aandeel in procenten. */
export function BarList({ items, total, max = 10, empty = "Nog geen gegevens in deze periode.", otherLabel = "Overig", color }: {
  items: BarListItem[];
  /** Geheel voor de percentages; standaard de som van de items. */
  total?: number;
  max?: number;
  empty?: string;
  otherLabel?: string;
  /** CSS-waarde uit het thema, standaard `var(--chart-1)`. */
  color?: string;
}) {
  if (!items.length) return <p className="ui-muted">{empty}</p>;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const shown = sorted.length > max ? [...sorted.slice(0, max - 1), { label: otherLabel, value: sorted.slice(max - 1).reduce((s, i) => s + i.value, 0) }] : sorted;
  const top = Math.max(...shown.map((i) => i.value), 1);
  const sum = total ?? sorted.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="ui-barlist" style={color ? ({ "--sw": color } as CSSProperties) : undefined}>
      {shown.map((i) => (
        <li key={i.label}>
          <span className="ui-barlist-label">{i.label}</span>
          <span className="ui-barlist-track" aria-hidden="true"><span className="ui-barlist-bar" style={{ width: `${(i.value / top) * 100}%` }} /></span>
          <span className="ui-barlist-value">{num(i.value)}{sum > 0 && <small>{percent(i.value, sum)}%</small>}</span>
        </li>
      ))}
    </ul>
  );
}
