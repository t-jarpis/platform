# 0006 · Bezoekersanalyse als platformpakket

- Status: aangenomen
- Datum: 2026-11-09

## Context
De eerste site heeft een eigen bezoekersanalyse zonder cookies: events via de website naar de API, dagtotalen, een bezoekerscode met een dagelijks zout die na 90 dagen wordt vervangen, en een admin panel met grafieken. De tweede site (puzzels) wil hetzelfde. Volgens ADR 0001 mag gedeelde code dan naar het platform, als hij niets van een site weet. De eerste site had per soort event een eigen kolom in de dagtotalen; dat is niet generiek.

## Besluit
- **Nieuw pakket `@t-jarpis/analytics`, zonder framework.** De site maakt er zelf een module of route van (ongeveer 80 regels in NestJS, met de eigen admin-guard). Zo kan analytics later ook in een worker of eigen dienst draaien.
- **De site definieert haar events** met `defineAnalytics({ events, pages, entries, segments?, markets?, timeZone? })`. Het platform kent alleen `page_view`. Alles wat niet in de definitie staat, weigert de API (zod).
- **Item = soort:niveau, nooit een seed of id.** Een item is hooguit twee korte delen; zes cijfers achter elkaar worden geweigerd. Zo blijft het aantal regels in de dagtotalen begrensd. Varianten zijn een vaste lijst per soort.
- **Dagtotalen in lange vorm**: `daily_counts(dag, soort, item, variant, segment, markt, land, aantal, bezoekers)` in plaats van een kolom per soort. Daarnaast `daily_pages`, `daily_visitors` en `daily_sources` zoals bij de eerste site; `org` heet generiek `segment`. `aggregated_days` houdt bij wanneer een dag is opgeteld, zodat `staleDays` ook dagen zonder totalen en late events vindt (vijf minuten speling voor transacties die tegelijk liepen).
- **Eigen schema `analytics` met eigen migraties** in het pakket (`migrations/`, Drizzle-migrator met `analytics.__migrations`), los van de migraties van de site. `migrateAnalytics(db)` draait vóór die van de site, onder het opstartslot van de site.
- **Rechten en row-level security niet in de migraties** maar in `applyGrants(db, { role })`, idempotent bij het opstarten. Elke site kiest haar eigen rol; twee sites op één databaseserver delen geen rol. Het pakket maakt geen rollen. Het beleid gebruikt `nullif(current_setting('app.tenant_id', true), '')::uuid`, zodat een lege instelling niets laat zien in plaats van een fout te geven.
- **`runInTenant`** is de `withTenant` van de site (transactie, rol, `app.tenant_id`). RLS blijft zo bij de site.
- **Privacy zoals bij de eerste site**: geen cookies, geen IP-adres of user agent in de database, bezoekerscode met dagelijks zout, na 90 dagen per dag een willekeurige vervanger met een weggegooide sleutel, bots tellen niet mee. Ruwe events blijven bewaard.
- **Subpath `/web`** zonder databasecode voor de website: `device`, `visitorHash`, `isBot`, `referrerHost`, `parseClientEvent`, `toEvent` en `send` met twee nieuwe pogingen (0,3 en 1,2 s; geen nieuwe poging bij een 4xx behalve 429).
- `drizzle-orm` ^0.45 is een peer dependency (optioneel, zodat de website hem niet nodig heeft). Tests draaien tegen PGlite met een eigen rol, zodat RLS echt getest wordt.

## Afwegingen
- *Brede dagtotalen per site* (een kolom per soort) zijn sneller te lezen, maar vragen per site een eigen schema en migratie bij elke nieuwe soort. Lange vorm is generiek en een nieuwe soort vraagt geen migratie.
- *NestJS-module in het pakket*: minder werk per site, maar bindt het pakket aan één framework en aan de guards van een site.
- *Rechten in de migraties* (zoals de eerste site): de rolnaam zou dan vastliggen en gedeeld worden tussen sites op dezelfde server.
- *Schema configureerbaar*: niet gedaan; de tabellen hebben een vaste plek. Een site die al een eigen schema `analytics` heeft, hernoemt dat eerst bij de overstap.

## Gevolgen
- De eerste site verandert nu niet. Stapt ze later over, dan eerst haar schema hernoemen, de oude dagtotalen omzetten naar `daily_counts` en per dag vergelijken in een test (eigen ADR in die site).
- Labels, groepering en welke soorten op welke pagina staan, horen bij het admin panel van de site.
- Groei zoals eerder besloten: eerst maandpartities van `events` en een wachtrij voor het aanleveren, daarna eventueel een eigen opslag om te tellen; het contract blijft gelijk.
