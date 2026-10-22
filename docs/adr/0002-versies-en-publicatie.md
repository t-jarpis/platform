# 0002 · Versies en publicatie van pakketten

- Status: aangenomen
- Datum: 2026-10-22

## Besluit
- Pakketten heten `@t-jarpis/<naam>` en staan privé op GitHub Packages.
- Versies volgen semver en worden beheerd met Changesets. Een wijziging zonder changeset wordt niet gepubliceerd.
- Sites nemen een vaste versie op als tarball in hun eigen repo (`vendor/`), bijgewerkt met een script of een pull request. Zo kan een site installeren en bouwen zonder token voor GitHub Packages en is hij los verkoopbaar. Een major-versie pas als de site er klaar voor is. (Aangepast 22-10-2026; eerst: rechtstreeks uit GitHub Packages met Renovate.)
- Beveiligingsfixes krijgen een patch-versie en worden met voorrang in alle sites samengevoegd.
