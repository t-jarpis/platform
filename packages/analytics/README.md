# @t-jarpis/analytics

Bezoekersanalyse zonder cookies voor elke site: events opslaan, per dag optellen en uitlezen voor het admin panel. Geen framework; de site maakt er zelf een module of route van. Besluit: [ADR 0006](../../docs/adr/0006-bezoekersanalyse-als-platformpakket.md).

## Privacy
- Geen cookies, geen opslag in de browser, geen IP-adres en geen user agent in de database.
- Per bezoek alleen: soort event, item, variant, markt, land, soort apparaat, soort pagina, segment, ingang, hostnaam van de verwijzer, tijdstip en een **bezoekerscode** met een dagelijks wisselend zout (HMAC van de dag met een geheim). Over dagen heen is niemand te volgen.
- Na **90 dagen** krijgt de bezoekerscode per dag een nieuwe, willekeurige code (`anonymize`); de sleutel daarvan wordt weggegooid. Binnen een dag kloppen unieke bezoekers nog, terug naar IP en browser kan niemand meer.
- **Bots** (zoekmachines, previews, geautomatiseerde browsers) tellen niet mee (`isBot`).
- Alles buiten de definitie van de site wordt geweigerd: geen adressen, zoektermen of vrije tekst.

## Definitie van de site
```ts
import { defineAnalytics } from "@t-jarpis/analytics/web"; // zonder databasecode, ook bruikbaar in de website

export const analyticsConfig = defineAnalytics({
  events: {
    item_view: { item: /^(soort-a|soort-b):[a-z-]+$/, itemRequired: true, variants: ["daily"] },
    item_done: { item: /^(soort-a|soort-b):[a-z-]+$/, itemRequired: true, variants: ["daily"] },
    print: { item: /^(soort-a|soort-b):[a-z-]+$/ },
  },
  pages: ["home", "overview", "detail", "about"],
  entries: ["nl"],            // ingangen voor een binnenkomst, bijvoorbeeld het domein
  markets: ["nl-NL"],          // leeg = elke markt van de vorm xx-XX
  segments: [],                // bijvoorbeeld organisaties; standaard alleen "main"
  timeZone: "Europe/Amsterdam",
});
```
- `page_view` bestaat altijd; daarop lopen pagina's, bezoekers en bronnen.
- **Item = soort:niveau, nooit een seed of id.** Een item is hooguit twee delen (`a-z0-9-`, elk ≤ 32 tekens); zes cijfers achter elkaar wordt geweigerd. Anders groeit het aantal regels in `daily_counts` onbeperkt.
- `variants` is een vaste, korte lijst (bijvoorbeeld een speciale uitvoering die apart geteld moet worden).

## API (server)
```ts
import { applyGrants, createAnalytics, migrateAnalytics, sameSecret } from "@t-jarpis/analytics";

// Bij het opstarten, onder het opstartslot van de site en vóór de eigen migraties:
await migrateAnalytics(db);
await applyGrants(db, { role: "site_app" });    // rol bestaat al; zonder role alleen row-level security

const analytics = createAnalytics({ db, tenantId: env.TENANT_ID, runInTenant: withTenant, config: analyticsConfig });

// POST /v1/internal/events (alleen de website, met x-ingest-key)
if (!sameSecret(req.headers["x-ingest-key"], env.INGEST_KEY)) throw unauthorized();
const parsed = analyticsConfig.EventBatch.safeParse(body);
if (!parsed.success) throw badRequest();
await analytics.record(parsed.data);

// Timer, bijvoorbeeld elke 10 minuten en kort na het opstarten (idempotent, veilig met replica's):
await analytics.maintain();

// Admin-endpoints
await analytics.overview("2026-11-01", "2026-11-30");
await analytics.counts({ from, to, types: ["item_view", "item_done"], groupBy: "item", variant: "daily" });
await analytics.realtime();
await analytics.activity({ from, to, types: ["print"] });
```
- `db` is een Drizzle-database voor PostgreSQL (`drizzle-orm` ^0.45, node-postgres of PGlite).
- `runInTenant(db, tenantId, work)` is de `withTenant` van de site: één transactie, eigen rol, `app.tenant_id` gezet. Zonder `runInTenant` zet het pakket alleen `app.tenant_id`.
- `overview` geeft totalen per soort event (`counts`) met de vorige periode van gelijke lengte, een reeks per dag (tot 92 dagen, daarna per week), pagina's, apparaten, segmenten, landen, ingangen en verwijzers (top 15, de rest als `*`).
- `counts` groepeert op `item`, `day`, `market`, `country`, `variant` of `segment`. `''` = zonder.
- `activity` geeft weekdag × uur in de tijdzone van de definitie en de laatste 30 events met de binnenkomst van hetzelfde bezoek (`via`), zonder bezoekerscode.
- **Bezoekers zijn per dag uniek.** Over meer dagen is het een som van dagelijkse bezoekers; zeg dat erbij in het panel.
- Ongeldige datums of soorten geven een `RangeError` (maak er een 400 van).

## Website (`@t-jarpis/analytics/web`)
```ts
import { parseClientEvent, send, toEvent } from "@t-jarpis/analytics/web";

// app/e/route.ts: de browser stuurt { type, market, page?, item?, variant?, entry?, ref? } met sendBeacon
export async function POST(req: Request) {
  const client = parseClientEvent(await req.json().catch(() => null), analyticsConfig);
  if (!client) return new Response(null, { status: 400 });
  const event = toEvent(client, req, { secret: process.env.ANALYTICS_SALT_SECRET!, ownHosts: ["www.example.org"] });
  if (event) await send([event], { apiUrl: process.env.API_URL!, ingestKey: process.env.INGEST_KEY! });
  return new Response(null, { status: 204 });
}
```
- `toEvent` bepaalt apparaat, land (`cf-ipcountry`) en bezoekerscode op de server en houdt van de verwijzer alleen een vreemde hostnaam over. Geeft `null` voor bots.
- `send` probeert een mislukte telling nog twee keer (na 0,3 en 1,2 s, elk 3 s time-out); een 4xx behalve 429 niet. Mislukt het, dan één logregel zonder bezoekersgegevens. Gooit nooit.
- Losse bouwstenen: `device(ua)`, `isBot(ua)`, `visitorHash({ ip, userAgent, secret })`, `requestInfo(headers)`, `referrerHost(ref, ownHosts)`.

## Database
Schema `analytics`, met een eigen migratietabel `analytics.__migrations`:

| Tabel | Inhoud |
| --- | --- |
| `events` | ruwe events (blijven bewaard; bezoekerscode na 90 dagen vervangen) |
| `daily_counts` | per dag, soort, item, variant, segment, markt en land: aantal en unieke bezoekers |
| `daily_pages` | paginaweergaven per dag, segment, soort pagina, markt en apparaat |
| `daily_visitors` | unieke bezoekers per dag en segment (`*` = hele site) |
| `daily_sources` | binnenkomsten per dag, segment, ingang en verwijzer |
| `aggregated_days` | wanneer een dag voor het laatst is opgeteld (voor `staleDays`) |

Rechten en row-level security staan niet in de migraties maar in `applyGrants`, zodat elke site haar eigen rol kiest. Het beleid: `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`; zonder tenant ziet de app niets.

Schema wijzigen: `src/schema.ts` aanpassen, `pnpm --filter @t-jarpis/analytics db:generate`, en in de nieuwe SQL `CREATE SCHEMA` vervangen door `CREATE SCHEMA IF NOT EXISTS` als die erin staat. Een migratie die bestaande data verandert of weggooit is een major-versie.

## Groeien
Tot ongeveer een miljoen events per maand volstaan ruwe events plus dagtotalen in PostgreSQL. Daarna: `events` per maand partitioneren, aanleveren via een wachtrij, en het panel van een leesreplica laten lezen. Het contract (`EventInput`, de queries) blijft gelijk.

## Tests
De tests draaien tegen PostgreSQL in het geheugen (PGlite), met een eigen rol om row-level security echt te controleren.
