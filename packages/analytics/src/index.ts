import { timingSafeEqual } from "node:crypto";

export { createAnalytics, setTenant, buckets, shiftDay, PSEUDONYM_DAYS } from "./analytics.js";
export type { Analytics, Bucket, CreateAnalyticsOptions, Db, GroupBy, RunInTenant } from "./analytics.js";
export { defineAnalytics, ALL_SEGMENTS, DEVICES, ITEM_PATTERN, PAGE_VIEW } from "./define.js";
export type { AnalyticsDefinition, AnalyticsOptions, ClientEvent, Device, EventInput, EventSpec } from "./define.js";
export { analyticsMigrationsFolder, applyGrants, migrateAnalytics } from "./setup.js";
export type { GrantOptions } from "./setup.js";
export * as analyticsTables from "./schema.js";

/** Vergelijkt de meegestuurde `x-ingest-key` in constante tijd met de sleutel van de API. */
export function sameSecret(given: string | undefined | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
