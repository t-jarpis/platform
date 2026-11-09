import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Db } from "./analytics.js";
import { TENANT_TABLES } from "./schema.js";

const SCHEMA = "analytics";
const ROLE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Map met de SQL-migraties van dit pakket (meegeleverd in `migrations/`). */
export const analyticsMigrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

interface Internals { dialect: { migrate(m: unknown, s: unknown, c: unknown): Promise<void> }; session: unknown }

/**
 * Draait de migraties van `@t-jarpis/analytics`, los van die van de site: eigen migratietabel
 * `analytics.__migrations`. Idempotent. Draai het onder het opstartslot van de site als er meerdere
 * instances tegelijk kunnen starten, en vóór de eigen migraties van de site.
 */
export async function migrateAnalytics(db: Db): Promise<void> {
  const config = { migrationsFolder: analyticsMigrationsFolder, migrationsSchema: SCHEMA, migrationsTable: "__migrations" };
  const internals = db as unknown as Internals;
  await internals.dialect.migrate(readMigrationFiles(config), internals.session, config);
}

export interface GrantOptions {
  /**
   * Rol waarmee de app de tabellen leest en schrijft (bestaat al; het pakket maakt geen rollen). Leeg = alleen
   * row-level security aanzetten, bijvoorbeeld als de app als eigenaar van de tabellen verbindt.
   */
  role?: string;
}

/**
 * Rechten en row-level security op de tabellen van dit pakket. Idempotent; draai het bij het opstarten na
 * `migrateAnalytics`. Het beleid laat alleen rijen zien waarvan `tenant_id` gelijk is aan `app.tenant_id`
 * (gezet door `runInTenant`); zonder die instelling ziet de app niets. Staat niet in de migraties, zodat elke
 * site zelf de rol kiest en twee sites op één server geen rol hoeven te delen.
 */
export async function applyGrants(db: Db, options: GrantOptions = {}): Promise<void> {
  await grantTenantTables(db, SCHEMA, TENANT_TABLES, options.role);
}

/** Gedeeld door `applyGrants`: rechten en tenantbeleid op een rij tabellen in één schema. */
export async function grantTenantTables(db: Db, schema: string, tables: readonly string[], role?: string): Promise<void> {
  if (role !== undefined && !ROLE.test(role)) throw new Error(`Ongeldige rolnaam: ${role}`);
  await db.transaction(async (tx) => {
    if (role !== undefined) {
      const found = (await tx.execute(sql`select 1 from pg_roles where rolname = ${role}`)) as unknown as { rows: unknown[] };
      if (!found.rows.length) throw new Error(`Rol ${role} bestaat niet; maak hem eerst aan (de site beheert rollen)`);
      await tx.execute(sql.raw(`grant usage on schema "${schema}" to "${role}"`));
    }
    for (const table of tables) {
      const name = `"${schema}"."${table}"`;
      if (role !== undefined) await tx.execute(sql.raw(`grant select, insert, update, delete on ${name} to "${role}"`));
      await tx.execute(sql.raw(`alter table ${name} enable row level security`));
      await tx.execute(sql.raw(`alter table ${name} force row level security`));
      const exists = (await tx.execute(sql`select 1 from pg_policies where schemaname = ${schema} and tablename = ${table} and policyname = 'tenant_isolation'`)) as unknown as { rows: unknown[] };
      if (!exists.rows.length) {
        await tx.execute(sql.raw(`create policy tenant_isolation on ${name}
          using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
          with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`));
      }
    }
  });
}
