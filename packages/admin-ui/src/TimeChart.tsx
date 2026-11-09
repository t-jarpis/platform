"use client";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { longDate, niceScale, num, shortDate, shortMonth, tick, type DateBucket } from "./format.js";
import { chartColor } from "./tokens.js";

/**
 * Eén reeks. `color` is een CSS-waarde uit het thema (`var(--chart-2)`), nooit een hex; leeg = `--chart-n` op
 * volgorde. `dash`: gestreept of gestippeld (bijvoorbeeld een doel). `null` = nog geen waarde (de lijn stopt).
 */
export interface Series { key: string; label: string; values: (number | null)[]; color?: string; dash?: "dash" | "dot" }

export interface TimeChartProps {
  title: string;
  /** YYYY-MM-DD (of YYYY-MM per maand), even lang als elke reeks. */
  dates: string[];
  series: Series[];
  bucket: DateBucket;
  kind?: "line" | "bar";
  /** Tekst van het uitklapblok met dezelfde cijfers als tabel. */
  tableLabel?: string;
}

const H = 240, L = 44, R = 12, T = 12, B = 28;

/**
 * Grafiek over de tijd zonder bibliotheek: lijnen (verloop) of staven (aantallen), één y-as, legenda bij twee
 * of meer reeksen, aanwijzen met muis, vinger of pijltjestoetsen, en dezelfde cijfers als tabel.
 */
export function TimeChart({ title, dates, series: input, bucket, kind = "line", tableLabel = "Toon als tabel" }: TimeChartProps) {
  const id = useId();
  const series = useMemo(() => input.map((s, i) => ({ ...s, color: s.color ?? chartColor(i) })), [input]);
  const [active, setActive] = useState<number | null>(null);
  // Tekent op de echte breedte, zodat labels altijd even groot blijven.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => { if (e) setW(Math.max(280, Math.round(e.contentRect.width))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const ticks = niceScale(max);
  const top = ticks.at(-1) || 1;
  const n = dates.length;
  const slot = (W - L - R) / Math.max(n, 1);
  const x = (i: number) => (kind === "bar" ? L + slot * i + slot / 2 : L + (n <= 1 ? (W - L - R) / 2 : ((W - L - R) * i) / (n - 1)));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 72))));
  const paths = series.map((s) => s.values.map((v, i) => (v === null ? "" : `${i && s.values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(" "));
  const barW = Math.min(24, Math.max(2, slot / Math.max(series.length, 1) - 2));

  function pick(clientX: number, rect: DOMRect) {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = kind === "bar" ? Math.floor((px - L) / slot) : Math.round(((px - L) / (W - L - R)) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  }
  const a = active;
  const tipLeft = a === null ? 0 : (x(a) / W) * 100;
  const dateLabel = (d: string) => (bucket === "month" ? shortMonth(d) : shortDate(d));

  return (
    <figure className="ui-chart">
      <div className="ui-chart-head">
        <h3 id={`${id}-t`}>{title}</h3>
        {series.length > 1 && (
          <ul className="ui-legend">{series.map((s) => <li key={s.key}><i style={{ "--sw": s.color } as CSSProperties} data-shape={kind === "bar" ? "bar" : undefined} data-dash={s.dash} />{s.label}</li>)}</ul>
        )}
      </div>
      <div ref={box} className="ui-chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} tabIndex={0}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())} onPointerLeave={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((v) => Math.min(n - 1, (v ?? -1) + 1));
            else if (e.key === "ArrowLeft") setActive((v) => Math.max(0, (v ?? n) - 1));
            else if (e.key === "Escape") setActive(null);
          }} onBlur={() => setActive(null)}>
          {ticks.map((t) => <line key={t} className={t === 0 ? "ui-chart-axis" : "ui-chart-grid"} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}
          {ticks.map((t) => <text key={`l${t}`} x={L - 8} y={y(t) + 4} textAnchor="end">{tick(t)}</text>)}
          {dates.map((d, i) => ((i % labelEvery === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= labelEvery / 2)
            ? <text key={d} x={x(i)} y={H - 8} textAnchor="middle">{dateLabel(d)}</text> : null))}
          {kind === "line" ? series.map((s, k) => (
            <g key={s.key}>
              {/* Vlak alleen bij één reeks: twee vlakken over elkaar worden modderig. */}
              {series.length === 1 && n > 0 && !s.values.includes(null) && <path className="ui-chart-area" fill={s.color} d={`${paths[k]} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} />}
              <path className="ui-chart-line" stroke={s.color} d={paths[k]} data-dash={s.dash} />
              {bucket === "month" && !s.dash && s.values.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />))}
            </g>
          )) : series.map((s, k) => s.values.map((v, i) => {
            if (v === null || v <= 0) return null;
            const bx = x(i) - (series.length * (barW + 2) - 2) / 2 + k * (barW + 2), by = y(v), h = y(0) - by;
            const r = Math.min(4, h, barW / 2);
            return <path key={`${s.key}${i}`} className="ui-chart-bar" fill={s.color} data-dim={a !== null && a !== i ? "" : undefined}
              d={`M${bx} ${y(0)} V${by + r} Q${bx} ${by} ${bx + r} ${by} H${bx + barW - r} Q${bx + barW} ${by} ${bx + barW} ${by + r} V${y(0)} Z`} />;
          }))}
          {a !== null && kind === "line" && (
            <g>
              <line className="ui-chart-cross" x1={x(a)} x2={x(a)} y1={T} y2={y(0)} />
              {series.map((s) => (s.values[a] === null ? null : <circle key={s.key} className="ui-chart-dot" cx={x(a)} cy={y(s.values[a] ?? 0)} r={5} fill={s.color} />))}
            </g>
          )}
        </svg>
        {a !== null && dates[a] !== undefined && (
          <div className="ui-chart-tip" role="status" style={{ left: `clamp(0px, calc(${tipLeft}% + 12px), calc(100% - 180px))` }}>
            <b>{longDate(dates[a], bucket)}</b>
            {series.map((s) => <span key={s.key}>{s.label} <b>{s.values[a] === null ? "–" : num(s.values[a] ?? 0)}</b></span>)}
          </div>
        )}
      </div>
      <details className="ui-chart-table">
        <summary>{tableLabel}</summary>
        <table className="ui-table">
          <thead><tr><th>{bucket === "week" ? "Week" : bucket === "month" ? "Maand" : "Dag"}</th>{series.map((s) => <th key={s.key} className="num">{s.label}</th>)}</tr></thead>
          <tbody>{dates.map((d, i) => <tr key={d}><td>{longDate(d, bucket)}</td>{series.map((s) => {
            const v = s.values[i];
            return <td key={s.key} className="num">{v === null || v === undefined ? "–" : num(v)}</td>;
          })}</tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
