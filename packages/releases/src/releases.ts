import { readFile } from "node:fs/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { notesBetween, parseReleaseLog, publicNotes, type LogEntry } from "./log.js";
import { releases } from "./schema.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>;
/** De `withTenant` van de site: één transactie, met de eigen rol en `app.tenant_id` gezet. */
export type RunInTenant = <T>(db: Db, tenantId: string, work: (tx: Db) => Promise<T>) => Promise<T>;

const setTenant: RunInTenant = (db, tenantId, work) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return work(tx as unknown as Db);
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateReleasesOptions {
  db: Db;
  tenantId: string;
  runInTenant?: RunInTenant;
  /** Hoeveel commits een eerste release hooguit laat zien. Standaard 30. */
  firstLimit?: number;
}

export type RecordResult = "recorded" | "unchanged";

/** Releasenotes per omgeving (schema `releases`). */
export function createReleases({ db, tenantId, runInTenant = setTenant, firstLimit }: CreateReleasesOptions) {
  if (!UUID.test(tenantId)) throw new Error("Ongeldige tenant (verwacht een UUID)");
  const run = <T>(work: (tx: Db) => Promise<T>) => runInTenant(db, tenantId, work);

  const api = {
    /**
     * Legt de draaiende versie vast als die anders is dan de laatste: eerste release, nieuwe release (met de
     * commits sinds de vorige) of terugdraaien (een versie die eerder draaide, zonder notes). Een slot per
     * tenant voorkomt dubbele regels als meerdere replica's tegelijk starten. `sha` mag verkort zijn.
     */
    record(sha: string, log: readonly LogEntry[]): Promise<RecordResult> {
      if (!/^[0-9a-f]{7,64}$/.test(sha)) throw new Error("Ongeldige sha");
      return run(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`t-jarpis.releases:${tenantId}`}))`);
        const [last] = await tx.select().from(releases).where(eq(releases.tenantId, tenantId)).orderBy(desc(releases.startedAt)).limit(1);
        const full = log.find((c) => c.sha.startsWith(sha))?.sha ?? sha;
        if (last?.sha === full) return "unchanged";
        const [seen] = await tx.select({ id: releases.id }).from(releases).where(and(eq(releases.tenantId, tenantId), eq(releases.sha, full))).limit(1);
        const kind = !last ? "first" : seen ? "rollback" : "release";
        const notes = kind === "rollback" ? [] : notesBetween(log, full, last?.sha ?? null, firstLimit);
        await tx.insert(releases).values({ tenantId, sha: full, previousSha: last?.sha ?? null, kind, notes });
        return "recorded";
      });
    },

    /**
     * Voor het opstarten van de API: leest het releaselog van schijf (ontbreekt het, dan zonder notes) en legt
     * `sha` vast. Zonder `sha` (lokaal) gebeurt er niets.
     */
    async recordOnStartup(options: { sha: string | undefined; logPath: string }): Promise<RecordResult | "skipped"> {
      if (!options.sha) return "skipped";
      let log: LogEntry[] = [];
      try { log = parseReleaseLog(await readFile(options.logPath, "utf8")); } catch { /* geen log: alleen de versie */ }
      return api.record(options.sha, log);
    },

    /** De laatste releases, nieuwste eerst. */
    list(limit = 50) {
      return run((tx) => tx.select({ sha: releases.sha, previousSha: releases.previousSha, kind: releases.kind, notes: releases.notes, startedAt: releases.startedAt })
        .from(releases).where(eq(releases.tenantId, tenantId)).orderBy(desc(releases.startedAt)).limit(Math.min(Math.max(1, limit), 500)));
    },

    /** Teksten voor bezoekers per uitrol (trailer `Public-note:`), nieuwste eerst en zonder herhalingen. */
    async publicNotes(limit = 20) {
      return publicNotes(await api.list(100), limit);
    },
  };
  return api;
}

export type Releases = ReturnType<typeof createReleases>;
