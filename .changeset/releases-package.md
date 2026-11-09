---
"@t-jarpis/releases": minor
---

Nieuw pakket: releasenotes per omgeving. `createReleases` legt bij het opstarten de draaiende versie vast (eerste release, nieuwe release met de commits sinds de vorige, of terugdraaien), met `list` en `publicNotes`. `notesBetween`, `readTrailer`, `parseGitLog` en `parseReleaseLog` (ook los via `/log`), en de opdracht `release-log` die het releaselog met de trailers `Release-note:` en `Public-note:` schrijft. Eigen schema `releases` met `migrateReleases` en `applyReleaseGrants`.
