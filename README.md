# Platform

Gedeelde bouwstenen voor alle sites van t-jarpis. Elke site heeft een eigen repo en gebruikt deze pakketten met een versienummer.

| Pakket | Inhoud | Status |
| --- | --- | --- |
| `@t-jarpis/config` | TypeScript- en ESLint-instellingen | 0.1 |
| `@t-jarpis/auth` | Inloggen via Zitadel: BFF met versleutelde sessie, tokencontrole voor de API, nep-Zitadel voor tests | 0.2 |
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
