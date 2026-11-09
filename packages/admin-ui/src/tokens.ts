/**
 * CSS-variabelen die de site moet leveren (thema of design system) voordat `admin.css` en de componenten
 * kloppen. Het pakket zet zelf geen kleuren, maten of lettertypen. `--sw` en `--heat` zet het pakket zelf.
 */
export const REQUIRED_TOKENS = [
  // Kleuren
  "--color-bg", "--color-surface", "--color-surface-sunken", "--color-text", "--color-text-muted",
  "--color-border", "--color-border-control", "--color-primary", "--color-success", "--color-danger", "--color-focus",
  // Grafieken (gevalideerd op contrast en kleurenblindheid, licht en donker)
  "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-grid",
  // Ruimte en vorm
  "--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6", "--space-8",
  "--radius-xs", "--radius-md", "--radius-card", "--border-thin", "--focus-width", "--focus-offset",
  "--shadow-card", "--shadow-raised",
  // Letters
  "--font-sans", "--font-display", "--font-display-weight",
  // Layout
  "--sidebar-admin", "--tap-min", "--z-sticky", "--z-raised",
] as const;
export type Token = (typeof REQUIRED_TOKENS)[number];

/**
 * Welke verplichte variabelen ontbreken in een stylesheet van de site (bijvoorbeeld het gegenereerde thema plus
 * de componentstijl). Voor een contracttest in de site: `expect(missingTokens(css)).toEqual([])`.
 */
export function missingTokens(css: string): Token[] {
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => (m[1] ?? "").toLowerCase()));
  return REQUIRED_TOKENS.filter((t) => !defined.has(t));
}

/** Standaardkleur van reeks `i`: `var(--chart-1)` tot `var(--chart-4)`, daarna weer van voren. */
export const chartColor = (i: number) => `var(--chart-${(i % 4) + 1})`;
