# @t-jarpis/admin-ui

## 0.2.0

### Minor Changes

- `StatCard` krijgt een optionele `trend` (reeks per dag of week); vanaf twee punten staat er een sparkline onder de vergelijking, zoals in het Kleurhoek-dashboard. Nieuw export `Sparkline`; stijl `ui-stat-spark` in `admin.css`.

## 0.1.0

### Minor Changes

- 8dd629c: Nieuw pakket: React-componenten en `admin.css` voor admin panels: `TimeChart`, `BarList`, `StatCard`, `ActivityHeatmap`, layout (`AdminShell`, `PageHeader`, `Panel`, `PanelGrid`, `StatGrid`), `SideNav` met `currentPath` en `NavLink` met een eigen linkcomponent, plus opmaak (`num`, `delta`, `longDate` …). Leest alleen CSS-variabelen van de site (`REQUIRED_TOKENS`, `missingTokens` voor een contracttest).
