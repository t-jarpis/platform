# 0001 · Het platform weet niets van sites

- Status: aangenomen
- Datum: 2026-10-22

## Context
We bouwen meerdere sites (de eerste is Kleurhoek) die elk los verkocht moeten kunnen worden. Gedeelde code mag een site niet aan een andere site vastknopen.

## Besluit
- Het platform bevat alleen code die elke site nodig heeft en die niets weet van het onderwerp van een site.
- Afhankelijkheden lopen één kant op: sites gebruiken het platform, nooit andersom.
- `scripts/guard-site-agnostic.mjs` draait in CI en weigert site-scopes en sitebegrippen (`guard.config.json`).
- Code verhuist pas naar het platform als een tweede site hem nodig heeft, via een pull request met een generieke API en eigen tests.
- Geen data, geheimen of content in het platform.

## Gevolgen
- Een site verkopen = site-repo overdragen plus een kopie van of licentie op de gebruikte platformversies. Het platform blijft van de eigenaar.
- Bij elke nieuwe site komt de scope en naam in `guard.config.json`.
