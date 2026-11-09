# @t-jarpis/analytics

## 0.1.0

### Minor Changes

- 8dd629c: Nieuw pakket: bezoekersanalyse zonder cookies. `defineAnalytics` (eigen soorten events met begrensde items `soort:niveau`, pagina's, ingangen, segmenten, markten, tijdzone; zod-schema's voor aanlevering), `createAnalytics` met `record`, `aggregateDay`, `staleDays`, `anonymize` (bezoekerscode na 90 dagen vervangen), `maintain`, `overview`, `counts`, `realtime` en `activity`. Eigen schema `analytics` met meegeleverde migraties (`migrateAnalytics`) en `applyGrants` voor rechten en row-level security per tenant. Subpath `/web`: `device`, `visitorHash` (dagelijks zout), `isBot`, `referrerHost`, `parseClientEvent`, `toEvent` en `send` met twee nieuwe pogingen.
