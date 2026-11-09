import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAnalytics, type Db, type RunInTenant } from "./analytics.js";
import { defineAnalytics, type EventInput } from "./define.js";
import { applyGrants, migrateAnalytics } from "./setup.js";

const TENANT = "0190a000-0000-7000-8000-000000000001";
const OTHER = "0190a000-0000-7000-8000-000000000002";

const config = defineAnalytics({
  events: {
    puzzle_view: { item: /^(grid|maze):[a-z-]+$/, itemRequired: true, variants: ["daily"] },
    puzzle_done: { item: /^(grid|maze):[a-z-]+$/, itemRequired: true, variants: ["daily"] },
    print: { item: /^[a-z:-]+$/ },
  },
  pages: ["home", "puzzle", "about"],
  entries: ["nl"],
  segments: ["partner"],
  markets: ["nl-NL", "nl-BE"],
});

const client = new PGlite();
const db = drizzle(client) as unknown as Db;
/** Zoals de `withTenant` van een site: eigen rol, tenant per transactie. */
const asApp: RunInTenant = (d, tenantId, work) => d.transaction(async (tx) => {
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
  await tx.execute(sql`set local role site_app`);
  return work(tx as unknown as Db);
});
const analytics = createAnalytics({ db, tenantId: TENANT, runInTenant: asApp, config });
const other = createAnalytics({ db, tenantId: OTHER, runInTenant: asApp, config });

const ev = (e: Partial<EventInput> & { occurredAt: string }): EventInput => ({ type: "page_view", market: "nl-NL", device: "desktop", visitorHash: "visitor-aaaaaaaaaaaa", ...e });

beforeAll(async () => {
  await client.exec("create role site_app nologin");
  await migrateAnalytics(db);
  await migrateAnalytics(db); // tweede keer: niets te doen
  await applyGrants(db, { role: "site_app" });
  await applyGrants(db, { role: "site_app" }); // idempotent
});
afterAll(() => client.close());

describe("defineAnalytics", () => {
  it("accepteert geldige events en weigert de rest", () => {
    const ok = config.EventBatch.safeParse([
      { type: "page_view", market: "nl-NL", device: "mobile", page: "home", entry: "nl", referrer: "example.org" },
      { type: "puzzle_view", item: "grid:starter", variant: "daily", market: "nl-BE", device: "desktop" },
      { type: "print", market: "nl-NL", device: "desktop" },
    ]);
    expect(ok.success).toBe(true);
    const bad = (e: object) => config.EventInput.safeParse({ market: "nl-NL", device: "desktop", ...e }).success;
    expect(bad({ type: "unknown" })).toBe(false);
    expect(bad({ type: "puzzle_view" })).toBe(false); // item verplicht
    expect(bad({ type: "puzzle_view", item: "grid:12345678" })).toBe(false); // lijkt op een seed
    expect(bad({ type: "puzzle_view", item: "grid:starter:extra" })).toBe(false);
    expect(bad({ type: "puzzle_view", item: "other:starter" })).toBe(false);
    expect(bad({ type: "puzzle_view", item: "grid:starter", variant: "weekly" })).toBe(false);
    expect(bad({ type: "page_view", page: "/some/url" })).toBe(false);
    expect(bad({ type: "page_view", referrer: "example.org" })).toBe(false); // alleen met binnenkomst
    expect(bad({ type: "page_view", segment: "nobody" })).toBe(false);
    expect(bad({ type: "page_view", market: "de-DE" })).toBe(false);
    expect(bad({ type: "page_view", ip: "1.2.3.4" })).toBe(false); // strikt: geen extra velden
    expect(bad({ type: "print", item: "grid:starter", entry: "nl" })).toBe(false);
    expect(config.EventBatch.safeParse([]).success).toBe(false);
  });

  it("weigert een onbruikbare definitie", () => {
    expect(() => defineAnalytics({ events: { page_view: {} }, pages: [], entries: [] })).toThrow();
    expect(() => defineAnalytics({ events: { "Bad Type": {} }, pages: [], entries: [] })).toThrow();
    expect(() => defineAnalytics({ events: {}, pages: [], entries: [], timeZone: "Mars/Olympus" })).toThrow();
    expect(defineAnalytics({ events: {}, pages: [], entries: [] }).types).toEqual(["page_view"]);
  });
});

describe("createAnalytics", () => {
  it("telt per dag, pagina, bron, segment en item", async () => {
    await analytics.record([
      ev({ occurredAt: "2026-11-02T08:00:00Z", page: "home", entry: "nl", referrer: "search.example", country: "NL" }),
      ev({ occurredAt: "2026-11-02T08:01:00Z", page: "puzzle" }),
      ev({ occurredAt: "2026-11-02T08:02:00Z", type: "puzzle_view", item: "grid:starter", variant: "daily" }),
      ev({ occurredAt: "2026-11-02T08:20:00Z", type: "puzzle_done", item: "grid:starter", variant: "daily" }),
      ev({ occurredAt: "2026-11-02T09:00:00Z", page: "home", visitorHash: "visitor-bbbbbbbbbbbb", device: "mobile", entry: "nl", country: "BE", market: "nl-BE" }),
      ev({ occurredAt: "2026-11-02T09:01:00Z", type: "puzzle_view", item: "maze:advanced", visitorHash: "visitor-bbbbbbbbbbbb", device: "mobile", market: "nl-BE" }),
      ev({ occurredAt: "2026-11-02T10:00:00Z", page: "home", visitorHash: "visitor-cccccccccccc", segment: "partner" }),
      ev({ occurredAt: "2026-11-03T12:00:00Z", type: "print", visitorHash: "visitor-dddddddddddd" }),
    ]);
    expect(await analytics.staleDays()).toEqual(["2026-11-02", "2026-11-03"]);
    await analytics.aggregateDay("2026-11-02");
    await analytics.aggregateDay("2026-11-02"); // idempotent
    await analytics.aggregateDay("2026-11-03");
    expect(await analytics.staleDays()).toEqual(["2026-11-02", "2026-11-03"]); // vijf minuten speling
    // Na de speling niet meer achter, tot er een event bijkomt.
    await client.exec("update analytics.aggregated_days set aggregated_at = now() + interval '1 minute'");
    expect(await analytics.staleDays()).toEqual([]);

    const o = await analytics.overview("2026-11-02", "2026-11-03");
    expect(o.bucket).toBe("day");
    expect(o.previous).toEqual({ from: "2026-10-31", to: "2026-11-01" });
    expect(o.totals).toMatchObject({ visitors: 4, pageViews: 4 });
    expect(o.totals.counts).toEqual({ page_view: 4, puzzle_view: 2, puzzle_done: 1, print: 1 });
    expect(o.previousTotals).toMatchObject({ visitors: 0, pageViews: 0 });
    expect(o.series).toEqual([
      { date: "2026-11-02", visitors: 3, pageViews: 4, counts: { page_view: 4, puzzle_view: 2, puzzle_done: 1, print: 0 } },
      { date: "2026-11-03", visitors: 1, pageViews: 0, counts: { page_view: 0, puzzle_view: 0, puzzle_done: 0, print: 1 } },
    ]);
    expect(o.pages).toEqual([{ page: "home", views: 3, visitors: 3 }, { page: "puzzle", views: 1, visitors: 1 }]);
    expect(o.devices).toEqual([{ device: "desktop", views: 3 }, { device: "mobile", views: 1 }]);
    expect(o.segments).toEqual([{ segment: "main", visitors: 3, views: 3 }, { segment: "partner", visitors: 1, views: 1 }]);
    expect(o.countries).toEqual([{ country: "", views: 2 }, { country: "BE", views: 1 }, { country: "NL", views: 1 }].sort((a, b) => b.views - a.views));
    expect(o.entries).toEqual([{ entry: "nl", landings: 2, visitors: 2 }]);
    expect(o.referrers).toEqual([{ referrer: "", landings: 1 }, { referrer: "search.example", landings: 1 }]);

    const byItem = await analytics.counts({ from: "2026-11-01", to: "2026-11-30", types: ["puzzle_view", "puzzle_done"], groupBy: "item" });
    expect(byItem).toEqual([
      { key: "grid:starter", type: "puzzle_done", count: 1, visitors: 1 },
      { key: "grid:starter", type: "puzzle_view", count: 1, visitors: 1 },
      { key: "maze:advanced", type: "puzzle_view", count: 1, visitors: 1 },
    ]);
    const daily = await analytics.counts({ from: "2026-11-01", to: "2026-11-30", types: ["puzzle_view"], groupBy: "item", variant: "daily" });
    expect(daily).toEqual([{ key: "grid:starter", type: "puzzle_view", count: 1, visitors: 1 }]);
    const perDay = await analytics.counts({ from: "2026-11-01", to: "2026-11-30", types: ["page_view", "print"], groupBy: "day" });
    expect(perDay.map((r) => [r.key, r.type, r.count])).toEqual([["2026-11-02", "page_view", 4], ["2026-11-03", "print", 1]]);
    await expect(analytics.counts({ from: "2026-11-01", to: "2026-11-30", types: ["nope"], groupBy: "item" })).rejects.toThrow(RangeError);
    await expect(analytics.counts({ from: "2026-11-01", to: "2026-11-30", types: ["print"], groupBy: "x" as "item" })).rejects.toThrow(RangeError);
  });

  it("vat lange periodes per week samen", async () => {
    const o = await analytics.overview("2026-08-01", "2026-11-30");
    expect(o.bucket).toBe("week");
    expect(o.series[0]!.date).toBe("2026-07-27"); // maandag
    expect(o.series.find((s) => s.date === "2026-11-02")).toMatchObject({ visitors: 4, pageViews: 4 });
  });

  it("houdt tenants gescheiden (row-level security)", async () => {
    await other.record([ev({ occurredAt: "2026-11-02T08:00:00Z" })]);
    await other.aggregateDay("2026-11-02");
    expect((await other.overview("2026-11-02", "2026-11-02")).totals.pageViews).toBe(1);
    expect((await analytics.overview("2026-11-02", "2026-11-02")).totals.pageViews).toBe(4);
    // Zonder tenant ziet de app-rol niets.
    const none = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role site_app`);
      return ((await tx.execute(sql`select count(*)::int as n from analytics.events`)) as unknown as { rows: { n: number }[] }).rows[0]!.n;
    });
    expect(none).toBe(0);
    // Schrijven voor een andere tenant mag niet.
    await expect(asApp(db, TENANT, (tx) => tx.execute(sql`insert into analytics.events (tenant_id, type, market, device, segment, occurred_at) values (${OTHER}, 'page_view', 'nl-NL', 'desktop', 'main', now())`))).rejects.toThrow();
  });

  it("toont wat er nu gebeurt", async () => {
    const now = new Date("2026-11-02T08:25:00Z");
    const r = await analytics.realtime(now);
    expect(r).toMatchObject({ visitors: 1, pageViews: 2 });
    expect(r.pages).toEqual([{ page: "home", views: 1 }, { page: "puzzle", views: 1 }]);
    expect(r.items).toEqual([{ type: "puzzle_done", item: "grid:starter", count: 1 }, { type: "puzzle_view", item: "grid:starter", count: 1 }]);
  });

  it("geeft weekdag × uur in de tijdzone van de site, met de binnenkomst", async () => {
    const a = await analytics.activity({ from: "2026-11-01", to: "2026-11-03", types: ["puzzle_done", "print"] });
    expect(a.timeZone).toBe("Europe/Amsterdam");
    // 2 november 2026 is een maandag; 08:20 UTC = 09:20 in Amsterdam. 3 november 12:00 UTC = dinsdag 13:00.
    expect(a.grid).toEqual([{ weekday: 1, hour: 9, count: 1 }, { weekday: 2, hour: 13, count: 1 }]);
    expect(a.latest.map((l) => [l.type, l.at])).toEqual([["print", "2026-11-03T12:00:00.000Z"], ["puzzle_done", "2026-11-02T08:20:00.000Z"]]);
    expect(a.latest[1]!.via).toEqual({ referrer: "search.example", page: "home", entry: "nl" });
    expect(a.latest[0]!.via).toBeNull();
    expect(JSON.stringify(a)).not.toContain("visitor-");
  });

  it("vervangt bezoekerscodes na 90 dagen, per dag consistent", async () => {
    await analytics.record([
      ev({ occurredAt: "2026-07-01T08:00:00Z", visitorHash: "visitor-oldoldoldold" }),
      ev({ occurredAt: "2026-07-01T09:00:00Z", visitorHash: "visitor-oldoldoldold" }),
      ev({ occurredAt: "2026-07-02T09:00:00Z", visitorHash: "visitor-oldoldoldold" }),
    ]);
    expect(await analytics.anonymize(new Date("2026-11-09T12:00:00Z"))).toBe(2);
    expect(await analytics.anonymize(new Date("2026-11-09T12:00:00Z"))).toBe(0);
    const hashes = await asApp(db, TENANT, async (tx) => ((await tx.execute(sql`select to_char(occurred_at, 'YYYY-MM-DD') as day, visitor_hash as h from analytics.events where occurred_at < '2026-08-01' order by occurred_at`)) as unknown as { rows: { day: string; h: string }[] }).rows);
    expect(hashes.every((r) => r.h.startsWith("~"))).toBe(true);
    expect(hashes[0]!.h).toBe(hashes[1]!.h); // zelfde dag: zelfde code
    expect(hashes[2]!.h).not.toBe(hashes[0]!.h); // andere dag: andere sleutel
    await analytics.aggregateDay("2026-07-01");
    expect((await analytics.overview("2026-07-01", "2026-07-01")).totals.visitors).toBe(1);
  });

  it("haalt alles in met maintain", async () => {
    await analytics.record([ev({ occurredAt: "2026-11-05T10:00:00Z" })]);
    const r = await analytics.maintain(new Date("2026-11-09T12:00:00Z"));
    expect(r.days).toContain("2026-11-05");
    expect(r.days).toContain("2026-11-09");
    expect((await analytics.overview("2026-11-05", "2026-11-05")).totals.pageViews).toBe(1);
  });

  it("weigert ongeldige invoer", async () => {
    expect(() => createAnalytics({ db, tenantId: "nope", config })).toThrow();
    await expect(analytics.overview("2026-11-05", "2026-11-01")).rejects.toThrow(RangeError);
    await expect(analytics.overview("gisteren", "2026-11-01")).rejects.toThrow(RangeError);
    await expect(applyGrants(db, { role: "does_not_exist" })).rejects.toThrow(/bestaat niet/);
    await expect(applyGrants(db, { role: "bad; drop" })).rejects.toThrow(/Ongeldige rolnaam/);
  });
});
