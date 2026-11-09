# 0008 · Componenten voor admin panels als platformpakket

- Status: aangenomen
- Datum: 2026-11-09

## Context
Het admin panel van de eerste site heeft grafieken zonder bibliotheek (lijn, staaf, ranglijst, kerncijfer, weekdag × uur), een layout en een zijmenu. De tweede site krijgt een admin panel met dezelfde onderdelen. Beide sites hebben een eigen thema met dezelfde semantische variabelen.

## Besluit
- **Nieuw pakket `@t-jarpis/admin-ui`**: React-componenten (`TimeChart`, `BarList`, `StatCard`, `ActivityHeatmap`, `AdminShell`, `PageHeader`, `Panel`, `PanelGrid`, `StatGrid`, `SideNav`, `NavLink`), opmaakfuncties en `admin.css`.
- **Alleen CSS-variabelen van de site.** Het pakket zet geen kleuren, maten of lettertypen. De verplichte variabelen staan in de README en in `REQUIRED_TOKENS`; een contracttest in het pakket controleert dat `admin.css` precies die variabelen leest en geen losse kleuren bevat. Sites testen hun thema met `missingTokens`.
- **Geen router in het pakket**: `SideNav` krijgt `currentPath` als prop en `NavLink` een eigen linkcomponent (bijvoorbeeld `next/link`). Iconen gaan als ReactNode mee.
- **Klassen met `ui-`**, zoals in het design system. Teksten zijn Nederlands en per component te vervangen.
- **Design system eerst** blijft gelden: een nieuwe of gewijzigde component komt eerst in het design system van de site en daarna in dit pakket.
- Nog niet meegenomen: de wereldkaart (groot topojson-bestand; later als aparte subpath), doelen-kaart en een datatabel. Die komen als een tweede site ze nodig heeft.

## Gevolgen
- React 19 is een peer dependency.
- Een site die zelf al `ui-chart`, `ui-stat` enzovoort definieert, haalt die weg bij de overstap, anders gelden twee stijlen tegelijk.
