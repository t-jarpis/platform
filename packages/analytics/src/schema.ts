import { sql } from "drizzle-orm";
import { date, index, integer, pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tabellen van `@t-jarpis/analytics` in een eigen schema. Wijzigingen hier gaan via `pnpm db:generate`
 * naar `migrations/`; de site draait ze met `migrateAnalytics`.
 */
export const analyticsSchema = pgSchema("analytics");

/**
 * Ruwe events zonder persoonsgegevens. Blijven bewaard; na 90 dagen krijgt de bezoekerscode per dag een
 * willekeurige vervanger (`anonymize`). `item` is een begrensde sleutel (soort:niveau), nooit een seed of id.
 */
export const events = analyticsSchema.table("events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  type: text("type").notNull(),
  item: text("item"),
  variant: text("variant"),
  market: text("market").notNull(),
  country: text("country"),
  device: text("device").notNull(),
  /** Hash met een dagelijks wisselend zout: niet over dagen heen te volgen. `~…` = na 90 dagen vervangen. */
  visitorHash: text("visitor_hash"),
  /** Soort pagina bij page_view, nooit een adres of zoekterm. */
  page: text("page"),
  segment: text("segment").notNull(),
  /** Binnenkomst: alleen bij de eerste paginaweergave van buitenaf. */
  entry: text("entry"),
  /** Hostnaam van de verwijzende site zonder pad ('' = direct of onbekend). */
  referrer: text("referrer"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("events_tenant_time").on(t.tenantId, t.occurredAt),
  index("events_tenant_created").on(t.tenantId, t.createdAt),
]);

/** Dagtotalen per soort event in lange vorm. `item`, `variant` en `country` zijn '' als ze ontbreken. */
export const dailyCounts = analyticsSchema.table("daily_counts", {
  tenantId: uuid("tenant_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  type: text("type").notNull(),
  item: text("item").notNull(),
  variant: text("variant").notNull(),
  segment: text("segment").notNull(),
  market: text("market").notNull(),
  country: text("country").notNull(),
  count: integer("count").notNull(),
  /** Unieke bezoekers die dag; over dagen heen niet op te tellen (elke dag een nieuw zout). */
  visitors: integer("visitors").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.type, t.item, t.variant, t.segment, t.market, t.country] })]);

/** Paginaweergaven per dag, segment, soort pagina, markt en apparaat. */
export const dailyPages = analyticsSchema.table("daily_pages", {
  tenantId: uuid("tenant_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  segment: text("segment").notNull(),
  page: text("page").notNull(),
  market: text("market").notNull(),
  device: text("device").notNull(),
  views: integer("views").notNull(),
  visitors: integer("visitors").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.segment, t.page, t.market, t.device] })]);

/** Unieke bezoekers per dag en segment; segment '*' = de hele site. */
export const dailyVisitors = analyticsSchema.table("daily_visitors", {
  tenantId: uuid("tenant_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  segment: text("segment").notNull(),
  visitors: integer("visitors").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.segment] })]);

/** Binnenkomsten per dag, segment, ingang en verwijzende site. */
export const dailySources = analyticsSchema.table("daily_sources", {
  tenantId: uuid("tenant_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  segment: text("segment").notNull(),
  entry: text("entry").notNull(),
  referrer: text("referrer").notNull(),
  landings: integer("landings").notNull(),
  visitors: integer("visitors").notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day, t.segment, t.entry, t.referrer] })]);

/** Wanneer een dag voor het laatst is opgeteld: basis voor `staleDays`. */
export const aggregatedDays = analyticsSchema.table("aggregated_days", {
  tenantId: uuid("tenant_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  aggregatedAt: timestamp("aggregated_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.day] })]);

/** Alle tabellen met een tenant_id: voor `applyGrants` (rechten en row-level security). */
export const TENANT_TABLES = ["events", "daily_counts", "daily_pages", "daily_visitors", "daily_sources", "aggregated_days"] as const;
