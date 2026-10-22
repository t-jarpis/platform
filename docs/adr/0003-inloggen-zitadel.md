# 0003 · Inloggen via Zitadel, gedeeld per omgeving

- Status: aangenomen
- Datum: 2026-10-22

## Besluit
- Zitadel Cloud (EU-regio): gratis plan tijdens de bouw, Pro bij de eerste lancering.
- Eén instance per omgeving (dev, staging, prod) voor alle sites. Elke site krijgt een eigen organisatie, een eigen project, een eigen inlogdomein en eigen app-registraties bij Google, Apple en Microsoft. Beheerders zitten in een aparte organisatie met verplichte passkeys.
- Inloggen zonder wachtwoorden: Google, Apple, Microsoft, e-mailcode en passkeys.
- Sites praten alleen standaard OIDC (BFF-patroon, tokens niet in de browser). Rechten komen uit de database van de site, niet uit het token.
- Bij verkoop of flinke omzet verhuist de organisatie van een site naar een eigen instance.
