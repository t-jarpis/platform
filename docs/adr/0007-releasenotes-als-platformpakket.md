# 0007 · Releasenotes als platformpakket

- Status: aangenomen
- Datum: 2026-11-09

## Context
De eerste site toont in haar admin panel per omgeving welke versie draait en wat er veranderde: de deploy-workflow schrijft een releaselog met de trailers `Release-note:` en `Public-note:`, en de API legt bij het opstarten de draaiende versie vast. De tweede site wil hetzelfde. Niets daaraan is eigen aan een site.

## Besluit
- **Nieuw pakket `@t-jarpis/releases`**: `createReleases({ db, tenantId, runInTenant })` met `record`, `recordOnStartup`, `list` en `publicNotes`; losse functies `notesBetween`, `readTrailer`, `parseGitLog` en `parseReleaseLog` (ook via `/log`, zonder database).
- **Opdracht `release-log`** in het pakket schrijft het releaselog uit `git log` (standaard 300 commits). Zo heeft geen workflow een eigen script nodig; de namen van de trailers zijn instelbaar.
- **Soorten**: eerste release, nieuwe release (commits tot de vorige versie, of hooguit 30 als die niet in het log staat) en terugdraaien (een versie die eerder draaide, zonder notes). Een advisory lock per tenant voorkomt dubbele regels bij meerdere replica's.
- **Eigen schema `releases`** met eigen migraties en `applyReleaseGrants`, zoals `@t-jarpis/analytics` (ADR 0006). Niet in een gedeeld schema `operations`: een site die zelf een schema met die naam maakt, zou dan botsen.

## Gevolgen
- Een site zonder `BUILD_SHA` (lokaal) legt niets vast.
- De eerste site verandert nu niet; bij een overstap verhuist haar tabel naar het schema `releases`.
