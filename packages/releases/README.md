# @t-jarpis/releases

Releasenotes per omgeving: de API legt bij het opstarten vast welke versie draait, met de commits sinds de vorige versie. Besluit: [ADR 0007](../../docs/adr/0007-releasenotes-als-platformpakket.md).

## Bij het bouwen: releaselog
In de deploy-workflow, na een checkout met genoeg geschiedenis (`fetch-depth: 300`):
```sh
pnpm exec release-log --out apps/api/release-log.json --max 300
```
Het log bevat per commit `sha`, `date`, `subject`, `note` (trailer `Release-note:`) en `public` (trailer `Public-note:`). Andere namen voor de trailers: `--note-key` en `--public-key`. Kopieer het bestand in het API-image en geef de commit mee als `BUILD_SHA`.

Een commit met een merkbare wijziging krijgt een trailer:
```
Fix print layout

Release-note: Printen past weer op één pagina.
Public-note: Printen gaat nu beter.
```
Zonder trailer staat de commit als technische wijziging in de notes, met het (Engelse) onderwerp.

## In de API
```ts
import { applyReleaseGrants, createReleases, migrateReleases } from "@t-jarpis/releases";

await migrateReleases(db);                               // onder het opstartslot
await applyReleaseGrants(db, { role: "site_app" });
const releases = createReleases({ db, tenantId: env.TENANT_ID, runInTenant: withTenant });

await releases.recordOnStartup({ sha: env.BUILD_SHA, logPath: "release-log.json" }); // lokaal zonder BUILD_SHA: niets
await releases.list(50);        // GET /v1/admin/releases
await releases.publicNotes(20); // "wat is er nieuw" voor bezoekers
```
- `record(sha, log)` geeft `recorded` of `unchanged`. Soorten: `first` (eerste in deze omgeving), `release` (nieuwe versie, met de commits tot de vorige) en `rollback` (een versie die eerder draaide, zonder notes). Is de vorige versie niet in het log te vinden, dan hooguit 30 commits (`firstLimit`).
- Een advisory lock per tenant voorkomt dubbele regels als meerdere replica's tegelijk starten.
- `sha` mag verkort zijn; het log maakt hem compleet.

## Losse functies (`@t-jarpis/releases/log`, zonder database)
`notesBetween(log, sha, previous)`, `publicNotes(releases)`, `readTrailer(message, key)`, `parseGitLog(output)`, `gitLogFormat()`, `parseReleaseLog(json)` (ongeldig of leeg geeft `[]`).

## Database
Schema `releases`, tabel `releases` (tenant, sha, vorige sha, soort, notes als JSON, starttijd), eigen migratietabel `releases.__migrations`. Rechten en row-level security via `applyReleaseGrants`, zoals bij `@t-jarpis/analytics`. Releases zijn per omgeving, want elke omgeving heeft een eigen database.
