# 0002 · Versies en publicatie van pakketten

- Status: aangenomen
- Datum: 2026-10-22

## Besluit
- Pakketten heten `@t-jarpis/<naam>` en staan privé op GitHub Packages.
- Versies volgen semver en worden beheerd met Changesets. Een wijziging zonder changeset wordt niet gepubliceerd.
- Sites gebruiken vaste versies en updaten via Renovate-pull-requests. Een major-versie pas als de site er klaar voor is.
- Beveiligingsfixes krijgen een patch-versie en worden met voorrang in alle sites samengevoegd.
