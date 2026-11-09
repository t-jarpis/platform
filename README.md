# Platform

Gedeelde bouwstenen voor alle sites van t-jarpis. Elke site heeft een eigen repo en gebruikt deze pakketten met een versienummer.

| Pakket | Inhoud | Status |
| --- | --- | --- |
| `@t-jarpis/config` | TypeScript- en ESLint-instellingen | 0.1 |
| `@t-jarpis/auth` | Inloggen via Zitadel: BFF met versleutelde sessie, tokencontrole voor de API, nep-Zitadel voor tests | 0.2 |
| `@t-jarpis/puzzles` | Puzzelgeneratoren voor de server: sudoku en binaire puzzel met beoordeling, doolhoven, woordzoeker, speurpuzzel, rekenpuzzels, nonogram, seeds | 0.1 (nieuw) |
| `@t-jarpis/analytics` | Bezoekersanalyse zonder cookies: events, dagtotalen, bezoekerscode met dagelijks zout (na 90 dagen vervangen), overzicht, tellingen, nu op de site, weekdag × uur; eigen schema en migraties. Subpath `/web` voor de website ([ADR 0006](docs/adr/0006-bezoekersanalyse-als-platformpakket.md)) | 0.1 (nieuw) |
| `@t-jarpis/releases` | Releasenotes per omgeving: versie vastleggen bij het opstarten, trailer `Release-note:`, opdracht `release-log` ([ADR 0007](docs/adr/0007-releasenotes-als-platformpakket.md)) | 0.1 (nieuw) |
| `@t-jarpis/admin-ui` | React-componenten en `admin.css` voor admin panels: grafieken, ranglijst, kerncijfers, weekdag × uur, layout, zijmenu; alleen CSS-variabelen van de site ([ADR 0008](docs/adr/0008-admin-ui-als-platformpakket.md)) | 0.1 (nieuw) |
| `@t-jarpis/access` | Rollen, permissies en auditlog | gepland |
| `terraform/` | Modules voor Azure-site, Cloudflare-zone en Zitadel-organisatie | gepland |

## Regels
Het platform weet niets van sites. Zie [ADR 0001](docs/adr/0001-platform-weet-niets-van-sites.md). De guard in CI controleert dat.

## Werken
```sh
pnpm install
pnpm check      # guard, lint, typecheck, test, build
pnpm changeset  # beschrijf je wijziging voor de volgende versie
```

## Architectuur
Het architectuurdocument met diagrammen: https://claude.ai/artifact/NmTKCWCDF31b6H4RY4XcEQ
