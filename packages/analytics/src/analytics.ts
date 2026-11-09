import { randomBytes } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { ALL_SEGMENTS, PAGE_VIEW, type AnalyticsDefinition, type EventInput } from "./define.js";
import { events } from "./schema.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>;

/**
 * Voert werk uit in één transactie voor één tenant (de `withTenant` van de site). De site bepaalt de rol en
 * zet `app.tenant_id`, zodat row-level security alleen rijen van deze tenant laat zien.
 */
export type RunInTenant = <T>(db: Db, tenantId: string, work: (tx: Db) => Promise<T>) => Promise<T>;

/** Standaard: alleen `app.tenant_id` zetten, zonder van rol te wisselen. */
export const setTenant: RunInTenant = (db, tenantId, work) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return work(tx as unknown as Db);
  });

export interface CreateAnalyticsOptions {
  db: Db;
  /** UUID van de tenant (vast per site, uit de omgeving). */
  tenantId: string;
  runInTenant?: RunInTenant;
  config: AnalyticsDefinition;
}

/** Na zoveel dagen krijgt de bezoekerscode in de ruwe events een willekeurige vervanger. */
export const PSEUDONYM_DAYS = 90;
/** Hoeveel verwijzende sites het overzicht apart noemt; de rest heet samen `*`. */
const TOP_REFERRERS = 15;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Bucket = "day" | "week";
export type GroupBy = "item" | "day" | "market" | "country" | "variant" | "segment";
const GROUP_COLUMNS: Record<GroupBy, string> = { item: "item", day: "day::text", market: "market", country: "country", variant: "variant", segment: "segment" };

export const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Alle dagen of weken (vanaf maandag) in de periode, ook zonder data, zodat een grafiek geen gaten overslaat. */
export function buckets(from: string, to: string, bucket: Bucket): string[] {
  const out: string[] = [];
  let d = from;
  if (bucket === "week") d = shiftDay(from, -((new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7));
  for (; d <= to; d = shiftDay(d, bucket === "week" ? 7 : 1)) out.push(d);
  return out;
}

function checkRange(from: string, to: string) {
  if (!DAY.test(from) || !DAY.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new RangeError("Geef from en to op als YYYY-MM-DD");
  if (from > to) throw new RangeError("from ligt na to");
}

async function rows<T>(tx: Db, query: SQL): Promise<T[]> {
  const res = (await tx.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}

/**
 * Bezoekersanalyse zonder cookies voor één site: events opslaan, per dag optellen en uitlezen voor het
 * admin panel. Alle tabellen staan in schema `analytics` (zie `migrateAnalytics` en `applyGrants`).
 */
export function createAnalytics({ db, tenantId, runInTenant = setTenant, config }: CreateAnalyticsOptions) {
  if (!UUID.test(tenantId)) throw new Error("Ongeldige tenant (verwacht een UUID)");
  const tz = config.timeZone;
  const run = <T>(work: (tx: Db) => Promise<T>) => runInTenant(db, tenantId, work);
  const t = tenantId;

  const api = {
    config,

    /** Slaat events op die al door `config.EventBatch` gecontroleerd zijn. Geeft het aantal terug. */
    async record(batch: EventInput[], now = new Date()): Promise<number> {
      if (!batch.length) return 0;
      await run((tx) => tx.insert(events).values(batch.map((e) => ({
        tenantId: t, type: e.type, item: e.item ?? null, variant: e.variant ?? null, market: e.market, country: e.country ?? null,
        device: e.device, visitorHash: e.visitorHash ?? null, page: e.page ?? null, segment: e.segment ?? config.defaultSegment,
        entry: e.entry ?? null, referrer: e.entry ? (e.referrer ?? "") : null,
        occurredAt: e.occurredAt ? new Date(e.occurredAt) : now,
      }))));
      return batch.length;
    },

    /** Maakt alle dagtotalen van één dag (UTC) opnieuw uit de ruwe events. Idempotent. */
    async aggregateDay(day: string): Promise<void> {
      checkRange(day, day);
      const start = new Date(`${day}T00:00:00Z`), end = new Date(start.getTime() + 86_400_000);
      const inDay = sql`tenant_id = ${t} and occurred_at >= ${start} and occurred_at < ${end}`;
      await run(async (tx) => {
        for (const table of ["daily_counts", "daily_pages", "daily_sources", "daily_visitors"]) {
          await tx.execute(sql`delete from ${sql.raw(`analytics.${table}`)} where tenant_id = ${t} and day = ${day}::date`);
        }
        await tx.execute(sql`
          insert into analytics.daily_counts (tenant_id, day, type, item, variant, segment, market, country, count, visitors)
          select ${t}::uuid, ${day}::date, type, coalesce(item, ''), coalesce(variant, ''), segment, market, coalesce(country, ''),
                 count(*)::int, count(distinct visitor_hash)::int
          from analytics.events where ${inDay}
          group by type, coalesce(item, ''), coalesce(variant, ''), segment, market, coalesce(country, '')`);
        await tx.execute(sql`
          insert into analytics.daily_pages (tenant_id, day, segment, page, market, device, views, visitors)
          select ${t}::uuid, ${day}::date, segment, coalesce(page, ''), market, device, count(*)::int, count(distinct visitor_hash)::int
          from analytics.events where ${inDay} and type = ${PAGE_VIEW}
          group by segment, coalesce(page, ''), market, device`);
        await tx.execute(sql`
          insert into analytics.daily_sources (tenant_id, day, segment, entry, referrer, landings, visitors)
          select ${t}::uuid, ${day}::date, segment, entry, coalesce(referrer, ''), count(*)::int, count(distinct visitor_hash)::int
          from analytics.events where ${inDay} and type = ${PAGE_VIEW} and entry is not null
          group by segment, entry, coalesce(referrer, '')`);
        await tx.execute(sql`
          insert into analytics.daily_visitors (tenant_id, day, segment, visitors)
          select ${t}::uuid, ${day}::date, segment, count(distinct visitor_hash)::int
          from analytics.events where ${inDay} group by segment having count(distinct visitor_hash) > 0
          union all
          select ${t}::uuid, ${day}::date, ${ALL_SEGMENTS}, count(distinct visitor_hash)::int
          from analytics.events where ${inDay} having count(distinct visitor_hash) > 0`);
        // Vijf minuten speling: een event dat net vóór het optellen begon maar later vastlegde, maakt de dag opnieuw "achter".
        await tx.execute(sql`
          insert into analytics.aggregated_days (tenant_id, day, aggregated_at) values (${t}, ${day}::date, now() - interval '5 minutes')
          on conflict (tenant_id, day) do update set aggregated_at = excluded.aggregated_at`);
      });
    },

    /**
     * Dagen waarvan de totalen achterlopen: nog nooit opgeteld, of er kwamen events bij na de laatste keer.
     * Na een stille periode (API op nul) wordt zo alles ingehaald.
     */
    staleDays(): Promise<string[]> {
      return run(async (tx) => (await rows<{ day: string }>(tx, sql`
        select d.day from (
          select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD') as day, max(created_at) as last
          from analytics.events where tenant_id = ${t} group by 1
        ) d left join analytics.aggregated_days a on a.tenant_id = ${t} and a.day = d.day::date
        where a.day is null or d.last >= a.aggregated_at order by 1`)).map((r) => r.day));
    },

    /**
     * Na 90 dagen krijgt de bezoekerscode per hele dag (UTC) een nieuwe, willekeurige code met een sleutel die
     * direct wordt weggegooid. Binnen die dag blijft hetzelfde apparaat herkenbaar (unieke bezoekers kloppen bij
     * opnieuw tellen); terug naar IP-adres en browser kan niemand meer. Geeft het aantal behandelde dagen terug.
     */
    anonymize(now = new Date()): Promise<number> {
      const cutoff = new Date(`${shiftDay(now.toISOString().slice(0, 10), -PSEUDONYM_DAYS)}T00:00:00Z`);
      const open = sql`tenant_id = ${t} and occurred_at < ${cutoff} and visitor_hash is not null and visitor_hash not like '~%'`;
      return run(async (tx) => {
        const days = await rows<{ day: string }>(tx, sql`select distinct to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD') as day from analytics.events where ${open}`);
        for (const { day } of days) {
          const key = randomBytes(32).toString("base64url"); // alleen in het geheugen, nergens bewaard
          const start = new Date(`${day}T00:00:00Z`), end = new Date(start.getTime() + 86_400_000);
          await tx.execute(sql`update analytics.events
            set visitor_hash = '~' || substr(encode(sha256(convert_to(${key} || visitor_hash, 'UTF8')), 'base64'), 1, 22)
            where ${open} and occurred_at >= ${start} and occurred_at < ${end}`);
        }
        return days.length;
      });
    },

    /**
     * Overzicht voor het dashboard: totalen per soort event met de vorige periode van gelijke lengte, een reeks
     * per dag (tot 92 dagen) of week, en verdelingen over pagina's, apparaten, segmenten, landen en bronnen.
     * Bezoekers zijn per dag uniek; over meer dagen is het een som ("bezoeken per dag").
     */
    async overview(from: string, to: string) {
      checkRange(from, to);
      const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
      const previous = { from: shiftDay(from, -days), to: shiftDay(from, -1) };
      const bucket: Bucket = days > 92 ? "week" : "day";
      const b = bucket === "week" ? sql`to_char(date_trunc('week', day), 'YYYY-MM-DD')` : sql`to_char(day, 'YYYY-MM-DD')`;
      const range = (a: string, z: string) => sql`tenant_id = ${t} and day >= ${a}::date and day <= ${z}::date`;
      return run(async (tx) => {
        const totals = async (a: string, z: string) => {
          const byType = await rows<{ type: string; count: number }>(tx, sql`select type, sum(count)::int as count from analytics.daily_counts where ${range(a, z)} group by type`);
          const [v] = await rows<{ visitors: number }>(tx, sql`select coalesce(sum(visitors), 0)::int as visitors from analytics.daily_visitors where ${range(a, z)} and segment = ${ALL_SEGMENTS}`);
          const counts = Object.fromEntries(config.types.map((ty) => [ty, 0])) as Record<string, number>;
          for (const r of byType) counts[r.type] = r.count;
          return { visitors: v?.visitors ?? 0, pageViews: counts[PAGE_VIEW] ?? 0, counts };
        };
        const current = await totals(from, to), before = await totals(previous.from, previous.to);

        const seriesCounts = await rows<{ date: string; type: string; count: number }>(tx, sql`select ${b} as date, type, sum(count)::int as count from analytics.daily_counts where ${range(from, to)} group by 1, 2`);
        const seriesVisitors = await rows<{ date: string; visitors: number }>(tx, sql`select ${b} as date, sum(visitors)::int as visitors from analytics.daily_visitors where ${range(from, to)} and segment = ${ALL_SEGMENTS} group by 1`);
        const vBy = new Map(seriesVisitors.map((r) => [r.date, r.visitors]));
        const series = buckets(from, to, bucket).map((date) => {
          const counts = Object.fromEntries(config.types.map((ty) => [ty, 0])) as Record<string, number>;
          for (const r of seriesCounts) if (r.date === date) counts[r.type] = r.count;
          return { date, visitors: vBy.get(date) ?? 0, pageViews: counts[PAGE_VIEW] ?? 0, counts };
        });

        const pages = await rows<{ page: string; views: number; visitors: number }>(tx, sql`select page, sum(views)::int as views, sum(visitors)::int as visitors from analytics.daily_pages where ${range(from, to)} group by page order by 2 desc`);
        const devices = await rows<{ device: string; views: number }>(tx, sql`select device, sum(views)::int as views from analytics.daily_pages where ${range(from, to)} group by device order by 2 desc`);
        const segViews = await rows<{ segment: string; views: number }>(tx, sql`select segment, sum(views)::int as views from analytics.daily_pages where ${range(from, to)} group by segment`);
        const segVisitors = await rows<{ segment: string; visitors: number }>(tx, sql`select segment, sum(visitors)::int as visitors from analytics.daily_visitors where ${range(from, to)} and segment <> ${ALL_SEGMENTS} group by segment`);
        const sv = new Map(segViews.map((s) => [s.segment, s.views]));
        const segments = segVisitors.map((s) => ({ segment: s.segment, visitors: s.visitors, views: sv.get(s.segment) ?? 0 })).sort((x, y) => y.visitors - x.visitors);
        const countries = await rows<{ country: string; views: number }>(tx, sql`select country, sum(count)::int as views from analytics.daily_counts where ${range(from, to)} and type = ${PAGE_VIEW} group by country order by 2 desc`);
        const entries = await rows<{ entry: string; landings: number; visitors: number }>(tx, sql`select entry, sum(landings)::int as landings, sum(visitors)::int as visitors from analytics.daily_sources where ${range(from, to)} group by entry order by 2 desc`);
        const refs = await rows<{ referrer: string; landings: number }>(tx, sql`select referrer, sum(landings)::int as landings from analytics.daily_sources where ${range(from, to)} group by referrer order by 2 desc, 1`);
        const referrers = refs.length > TOP_REFERRERS
          ? [...refs.slice(0, TOP_REFERRERS), { referrer: "*", landings: refs.slice(TOP_REFERRERS).reduce((n, r) => n + r.landings, 0) }]
          : refs;
        return { from, to, bucket, previous, totals: current, previousTotals: before, series, pages, devices, segments, countries, entries, referrers };
      });
    },

    /**
     * Aantallen uit de dagtotalen, gegroepeerd op item, dag, markt, land, variant of segment. `visitors` is een
     * som van dagelijkse unieke bezoekers. Lege sleutel ('') = zonder item, variant of land.
     */
    async counts(q: { from: string; to: string; types: readonly string[]; groupBy: GroupBy; variant?: string; segment?: string; limit?: number }) {
      checkRange(q.from, q.to);
      if (!(q.groupBy in GROUP_COLUMNS)) throw new RangeError("Ongeldige groupBy");
      const unknown = q.types.filter((ty) => !config.types.includes(ty));
      if (unknown.length || !q.types.length) throw new RangeError(`Onbekende soorten: ${unknown.join(", ") || "(geen)"}`);
      const key = sql.raw(GROUP_COLUMNS[q.groupBy]);
      const limit = Math.min(Math.max(1, q.limit ?? 500), 5000);
      const types = sql.join(q.types.map((ty) => sql`${ty}`), sql`, `);
      return run((tx) => rows<{ key: string; type: string; count: number; visitors: number }>(tx, sql`
        select ${key} as key, type, sum(count)::int as count, sum(visitors)::int as visitors
        from analytics.daily_counts
        where tenant_id = ${t} and day >= ${q.from}::date and day <= ${q.to}::date and type in (${types})
          ${q.variant !== undefined ? sql`and variant = ${q.variant}` : sql``}
          ${q.segment !== undefined ? sql`and segment = ${q.segment}` : sql``}
        group by 1, 2 order by ${q.groupBy === "day" ? sql`1, 2` : sql`3 desc, 1, 2`} limit ${limit}`));
    },

    /**
     * Nu op de site: unieke bezoekers, paginaweergaven, populairste pagina's en items in de laatste 30 minuten,
     * uit de ruwe events. Rond middernacht (UTC) telt iemand even dubbel (nieuw zout).
     */
    realtime(now = new Date(), minutes = 30) {
      const since = new Date(now.getTime() - minutes * 60_000);
      const recent = sql`tenant_id = ${t} and occurred_at >= ${since} and occurred_at <= ${now}`;
      return run(async (tx) => {
        const [tot] = await rows<{ visitors: number; pageViews: number }>(tx, sql`select count(distinct visitor_hash)::int as "visitors", (count(*) filter (where type = ${PAGE_VIEW}))::int as "pageViews" from analytics.events where ${recent}`);
        const pages = await rows<{ page: string; views: number }>(tx, sql`select coalesce(page, '') as page, count(*)::int as views from analytics.events where ${recent} and type = ${PAGE_VIEW} group by 1 order by 2 desc, 1 limit 8`);
        const items = await rows<{ type: string; item: string; count: number }>(tx, sql`select type, item, count(*)::int as count from analytics.events where ${recent} and type <> ${PAGE_VIEW} and item is not null group by 1, 2 order by 3 desc, 1, 2 limit 8`);
        return { since: since.toISOString(), visitors: tot?.visitors ?? 0, pageViews: tot?.pageViews ?? 0, pages, items };
      });
    },

    /**
     * Wanneer events gebeuren: aantallen per weekdag (1 = maandag) en uur in `config.timeZone`, en de laatste 30
     * met tijdstip. `via` = de binnenkomst van hetzelfde bezoek op dezelfde (UTC-)dag, zonder bezoekerscode.
     */
    async activity(q: { from: string; to: string; types: readonly string[] }) {
      checkRange(q.from, q.to);
      if (!q.types.length || q.types.some((ty) => !config.types.includes(ty))) throw new RangeError("Onbekende soorten");
      const types = sql.join(q.types.map((ty) => sql`${ty}`), sql`, `);
      const where = sql`tenant_id = ${t} and type in (${types})
        and occurred_at >= (${q.from}::date)::timestamp at time zone ${tz} and occurred_at < (${shiftDay(q.to, 1)}::date)::timestamp at time zone ${tz}`;
      return run(async (tx) => {
        const grid = await rows<{ weekday: number; hour: number; count: number }>(tx, sql`
          select extract(isodow from occurred_at at time zone ${tz})::int as weekday, extract(hour from occurred_at at time zone ${tz})::int as hour, count(*)::int as count
          from analytics.events where ${where} group by 1, 2 order by 1, 2`);
        const latest = (await rows<{ at: Date | string; type: string; item: string | null; variant: string | null; market: string; device: string; hash: string | null }>(tx, sql`
          select occurred_at as at, type, item, variant, market, device, visitor_hash as hash from analytics.events where ${where} order by occurred_at desc limit 30`))
          .map((r) => ({ ...r, at: new Date(r.at) }));
        const hashes = [...new Set(latest.map((r) => r.hash).filter((h): h is string => !!h))];
        const oldest = latest.length ? new Date(Math.min(...latest.map((r) => r.at.getTime())) - 86_400_000) : null;
        const landings = hashes.length && oldest ? (await rows<{ hash: string; at: Date | string; referrer: string | null; page: string | null; entry: string }>(tx, sql`
          select visitor_hash as hash, occurred_at as at, referrer, page, entry from analytics.events
          where tenant_id = ${t} and type = ${PAGE_VIEW} and entry is not null and occurred_at >= ${oldest}
            and visitor_hash in (${sql.join(hashes.map((h) => sql`${h}`), sql`, `)})
          order by occurred_at`)).map((l) => ({ ...l, at: new Date(l.at) })) : [];
        const utcDay = (d: Date) => d.toISOString().slice(0, 10);
        return {
          from: q.from, to: q.to, timeZone: tz, grid,
          latest: latest.map(({ hash, ...r }) => {
            const l = landings.filter((x) => x.hash === hash && utcDay(x.at) === utcDay(r.at) && x.at <= r.at).at(-1);
            return { ...r, at: r.at.toISOString(), via: l ? { referrer: l.referrer ?? "", page: l.page ?? "", entry: l.entry } : null };
          }),
        };
      });
    },

    /**
     * Eén ronde onderhoud, voor een timer van de site (bijvoorbeeld elke 10 minuten): vandaag en alle
     * achterlopende dagen optellen, daarna oude bezoekerscodes vervangen. Veilig met meerdere replica's.
     */
    async maintain(now = new Date()): Promise<{ days: string[]; anonymized: number }> {
      const days = [...new Set([...(await api.staleDays()), now.toISOString().slice(0, 10)])].sort();
      for (const day of days) await api.aggregateDay(day);
      return { days, anonymized: await api.anonymize(now) };
    },
  };
  return api;
}

export type Analytics = ReturnType<typeof createAnalytics>;
