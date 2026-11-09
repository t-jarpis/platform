import { sql } from "drizzle-orm";
import { index, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ReleaseNote } from "./log.js";

/** Tabellen van `@t-jarpis/releases` in een eigen schema; wijzigingen via `pnpm db:generate`. */
export const releasesSchema = pgSchema("releases");

/**
 * Releases van deze omgeving: bij het opstarten legt de API vast welke versie draait, zodra die anders is
 * dan de vorige. `kind`: first = eerste in deze omgeving, release = nieuwe versie, rollback = een eerdere versie.
 */
export const releases = releasesSchema.table("releases", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  sha: text("sha").notNull(),
  previousSha: text("previous_sha"),
  kind: text("kind", { enum: ["first", "release", "rollback"] }).notNull(),
  notes: jsonb("notes").$type<ReleaseNote[]>().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("releases_tenant_started").on(t.tenantId, t.startedAt)]);

export const TENANT_TABLES = ["releases"] as const;
