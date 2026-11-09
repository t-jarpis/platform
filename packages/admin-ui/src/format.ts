/** Getallen en datums voor grafieken en kerncijfers (standaard nl-NL). Compact vanaf 10.000: 12,9K. */
const formats = new Map<string, { plain: Intl.NumberFormat; compact: Intl.NumberFormat }>();
function nf(locale: string) {
  let f = formats.get(locale);
  if (!f) { f = { plain: new Intl.NumberFormat(locale), compact: new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }) }; formats.set(locale, f); }
  return f;
}
export const num = (n: number, locale = "nl-NL") => (Math.abs(n) >= 10_000 ? nf(locale).compact.format(n) : nf(locale).plain.format(n));
/** Aslabels: compact vanaf 1000. */
export const tick = (n: number, locale = "nl-NL") => (Math.abs(n) >= 1000 ? nf(locale).compact.format(n) : nf(locale).plain.format(n));
/** Deel van een geheel als heel percentage; 0 als het geheel 0 is. */
export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export type DateBucket = "day" | "week" | "month";

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MONTHS_LONG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

/** "9 nov" uit YYYY-MM-DD, zonder tijdzoneverschuiving. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS.at((m ?? 1) - 1)}`;
}
/** "nov '26" uit YYYY-MM(-DD). */
export function shortMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS.at((m ?? 1) - 1)} '${String(y).slice(2)}`;
}
/** "Maandag 9 nov", "Week van 9 nov" of "november 2026". */
export function longDate(iso: string, bucket: DateBucket): string {
  if (bucket === "month") { const [y, m] = iso.split("-").map(Number); return `${MONTHS_LONG.at((m ?? 1) - 1)} ${y}`; }
  if (bucket === "week") return `Week van ${shortDate(iso)}`;
  const day = DAYS.at(new Date(`${iso}T12:00:00Z`).getUTCDay()) ?? "";
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${shortDate(iso)}`;
}

/** Ronde schaal voor aantallen: 0 en vier hele stappen op een "mooi" getal. */
export function niceScale(max: number): number[] {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) ?? 10) * mag);
  return [0, 1, 2, 3, 4].map((i) => Math.round(i * step * 100) / 100);
}

/** Verandering t.o.v. de vorige periode in hele procenten; `pct: null` als er niets te vergelijken is. */
export function delta(now: number, before: number): { pct: number | null; isNew: boolean } {
  if (before === 0) return { pct: null, isNew: now > 0 };
  return { pct: Math.round(((now - before) / before) * 100), isNew: false };
}
