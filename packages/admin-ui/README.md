# @t-jarpis/admin-ui

React-componenten en stijl voor de admin panels van alle sites: grafieken, ranglijsten, kerncijfers, weekdag × uur, layout en zijmenu. Eigen SVG, geen grafiekbibliotheek. Besluit: [ADR 0008](../../docs/adr/0008-admin-ui-als-platformpakket.md).

## Gebruik
```tsx
// app/layout.tsx van de admin-app
import "@site/theme/theme.css";          // tokens van de site (eerst)
import "@t-jarpis/admin-ui/admin.css";  // daarna de stijl van dit pakket
```
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminShell, NavLink, SideNav } from "@t-jarpis/admin-ui";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <AdminShell nav={
      <SideNav brand={<Logo />} currentPath={path} footer={<LogoutButton />}>
        <NavLink href="/" currentPath={path} link={Link} icon={<Icon name="home" />}>Dashboard</NavLink>
        <NavLink href="/releases" currentPath={path} link={Link}>Releases</NavLink>
      </SideNav>
    }>{children}</AdminShell>
  );
}
```

| Component | Wat |
| --- | --- |
| `TimeChart` | lijnen of staven over de tijd (`bucket`: day, week, month), legenda vanaf twee reeksen, aanwijzen met muis, vinger of pijltjes, cijfers ook als tabel. Kleur per reeks als `var(--chart-n)`; leeg = op volgorde. |
| `BarList` | ranglijst met balken en percentages, hooguit 10 regels (de rest als "Overig") |
| `StatCard` | kerncijfer met verandering t.o.v. de vorige periode (`upIsGood` bepaalt goed of slecht) |
| `ActivityHeatmap` | weekdag × uur uit `activity()` van `@t-jarpis/analytics` |
| `AdminShell`, `PageHeader`, `Panel`, `PanelGrid`, `StatGrid` | layout: zijmenu plus inhoud, kop, panelen, rij kerncijfers |
| `SideNav` | zijmenu; op een telefoon een balk met Menu. Krijgt `currentPath` van de site (geen router in het pakket) en sluit als die verandert. |
| `NavLink` | link met `aria-current="page"` voor de huidige sectie; `link` = eigen linkcomponent (bijv. `next/link`) |
| `num`, `tick`, `percent`, `delta`, `shortDate`, `shortMonth`, `longDate`, `niceScale` | opmaak (standaard nl-NL) |

Teksten (Nederlands) zijn per component te vervangen: `tableLabel`, `empty`, `otherLabel`, `labels`, `dayNames`, `legend`.

`TimeChart` en `SideNav` zijn client components (`"use client"`); de rest kan ook op de server renderen.

## CSS-variabelen die de site levert
Het pakket zet zelf geen kleuren, maten of lettertypen; `admin.css` en de componenten lezen alleen deze variabelen. Alleen `--sw` (kleur van een reeks) en `--heat` (0–1) zet het pakket zelf.

| Groep | Variabelen |
| --- | --- |
| Kleuren | `--color-bg`, `--color-surface`, `--color-surface-sunken`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-border-control`, `--color-primary`, `--color-success`, `--color-danger`, `--color-focus` |
| Grafieken | `--chart-1`, `--chart-2`, `--chart-3`, `--chart-4`, `--chart-grid` (gevalideerd op contrast en kleurenblindheid, licht en donker) |
| Ruimte en vorm | `--space-1` … `--space-6`, `--space-8`, `--radius-xs`, `--radius-md`, `--radius-card`, `--border-thin`, `--focus-width`, `--focus-offset`, `--shadow-card`, `--shadow-raised` |
| Letters | `--font-sans`, `--font-display`, `--font-display-weight` |
| Layout | `--sidebar-admin`, `--tap-min`, `--z-sticky`, `--z-raised` |

De lijst staat ook in code: `REQUIRED_TOKENS`. Zet in de site een contracttest:
```ts
import { readFileSync } from "node:fs";
import { missingTokens } from "@t-jarpis/admin-ui";
const css = readFileSync("packages/theme/generated/theme.css", "utf8") + readFileSync("packages/theme/src/ui.css", "utf8");
expect(missingTokens(css)).toEqual([]);
```
`--tap-min` is in sommige thema's per modus gezet (bijvoorbeeld `--tap-min-beheer`); de admin-app zet dan de juiste modus of de variabele zelf.

## Regels
- Een nieuwe of gewijzigde component komt eerst in het design system van de site (spec, tokens, voorbeeld) en daarna hier.
- Geen hex-, rgb- of hsl-waarden in `admin.css` of de componenten; de contracttest in dit pakket controleert dat, en dat `admin.css` precies de variabelen hierboven leest.
- Klassen beginnen met `ui-`. Heeft een site zelf al dezelfde klassen (`ui-chart`, `ui-stat` …), haal die dan weg bij de overstap.
