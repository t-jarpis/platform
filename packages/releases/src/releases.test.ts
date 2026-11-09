import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gitLogFormat, notesBetween, parseGitLog, parseReleaseLog, publicNotes, readTrailer, type LogEntry } from "./log.js";
import { createReleases, type Db, type RunInTenant } from "./releases.js";
import { applyReleaseGrants, migrateReleases } from "./setup.js";

const sha = (n: number) => n.toString(16).padStart(40, "0");
const LOG: LogEntry[] = [
  { sha: sha(5), date: "2026-11-05T10:00:00+01:00", subject: "Add hint button", note: "Nieuwe knop voor een hint.", public: "Je kunt nu een hint vragen." },
  { sha: sha(4), date: "2026-11-04T10:00:00+01:00", subject: "Refactor solver", note: "", public: "" },
  { sha: sha(3), date: "2026-11-03T10:00:00+01:00", subject: "Fix print layout", note: "Printen past op één pagina.", public: "" },
  { sha: sha(2), date: "2026-11-02T10:00:00+01:00", subject: "Initial", note: "", public: "" },
];

describe("log", () => {
  it("geeft de commits tussen twee versies", () => {
    expect(notesBetween(LOG, sha(5), sha(3))).toEqual([
      { sha: sha(5), date: LOG[0]!.date, text: "Nieuwe knop voor een hint.", technical: false, public: "Je kunt nu een hint vragen." },
      { sha: sha(4), date: LOG[1]!.date, text: "Refactor solver", technical: true },
    ]);
    expect(notesBetween(LOG, sha(5), null, 2).map((n) => n.sha)).toEqual([sha(5), sha(4)]);
    expect(notesBetween(LOG, sha(5), "unknown", 3)).toHaveLength(3);
    expect(notesBetween(LOG, "missing", null)).toEqual([]);
  });

  it("leest trailers en git-uitvoer", () => {
    const msg = "Add hint button\n\nLonger explanation.\n\nRelease-note: Nieuwe knop\nPublic-note: Vraag een hint\nCo-Authored-By: X <x@example.org>";
    expect(readTrailer(msg, "Release-note")).toBe("Nieuwe knop");
    expect(readTrailer(msg, "public-note")).toBe("Vraag een hint");
    expect(readTrailer("Release-note: only a subject", "Release-note")).toBe("");
    const out = `${sha(5)}\x1f2026-11-05T10:00:00+01:00\x1fAdd hint\x1fNieuwe knop\x1f\x1e\n${sha(4)}\x1f2026-11-04T10:00:00+01:00\x1fRefactor\x1f\x1f\x1e\n`;
    expect(parseGitLog(out)).toEqual([
      { sha: sha(5), date: "2026-11-05T10:00:00+01:00", subject: "Add hint", note: "Nieuwe knop", public: "" },
      { sha: sha(4), date: "2026-11-04T10:00:00+01:00", subject: "Refactor", note: "", public: "" },
    ]);
    expect(parseReleaseLog(JSON.stringify(LOG))).toHaveLength(4);
    expect(parseReleaseLog("not json")).toEqual([]);
    expect(parseReleaseLog([{ sha: "x" }])).toEqual([]);
  });

  it("leest trailers uit een echte git-repo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "release-log-"));
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.org", ...args], { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "First change");
    git("commit", "-q", "--allow-empty", "-m", "Second change\n\nRelease-note: Tweede wijziging\nPublic-note: Iets nieuws");
    const log = parseGitLog(git("log", "-10", `--format=${gitLogFormat()}`));
    expect(log.map((c) => [c.subject, c.note, c.public])).toEqual([["Second change", "Tweede wijziging", "Iets nieuws"], ["First change", "", ""]]);
    expect(parseReleaseLog(log)).toHaveLength(2);
  });

  it("geeft publieke notes zonder herhalingen", () => {
    const n = notesBetween(LOG, sha(5), null);
    expect(publicNotes([{ startedAt: new Date("2026-11-06T00:00:00Z"), notes: n }, { startedAt: new Date("2026-11-05T00:00:00Z"), notes: n }]))
      .toEqual([{ date: "2026-11-06", notes: ["Je kunt nu een hint vragen."] }]);
  });
});

describe("createReleases", () => {
  const client = new PGlite();
  const db = drizzle(client) as unknown as Db;
  const asApp: RunInTenant = (d, tenantId, work) => d.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`set local role site_app`);
    return work(tx as unknown as Db);
  });
  const releases = createReleases({ db, tenantId: "0190a000-0000-7000-8000-000000000001", runInTenant: asApp });
  const other = createReleases({ db, tenantId: "0190a000-0000-7000-8000-000000000002", runInTenant: asApp });

  beforeAll(async () => {
    await client.exec("create role site_app nologin");
    await migrateReleases(db);
    await migrateReleases(db);
    await applyReleaseGrants(db, { role: "site_app" });
    await applyReleaseGrants(db, { role: "site_app" });
  });
  afterAll(() => client.close());

  it("legt eerste release, nieuwe release en terugdraaien vast", async () => {
    expect(await releases.record(sha(3), LOG)).toBe("recorded");
    expect(await releases.record(sha(3), LOG)).toBe("unchanged");
    expect(await releases.record(sha(5), LOG)).toBe("recorded");
    expect(await releases.record(sha(3), LOG)).toBe("recorded");
    const list = await releases.list();
    expect(list.map((r) => [r.kind, r.sha, r.previousSha])).toEqual([["rollback", sha(3), sha(5)], ["release", sha(5), sha(3)], ["first", sha(3), null]]);
    expect(list[1]!.notes.map((n) => n.text)).toEqual(["Nieuwe knop voor een hint.", "Refactor solver"]);
    expect(list[0]!.notes).toEqual([]);
    expect(await releases.publicNotes()).toEqual([{ date: expect.any(String), notes: ["Je kunt nu een hint vragen."] }]);
    expect(await other.list()).toEqual([]);
  });

  it("leest het log bij het opstarten", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "release-log-"));
    const file = path.join(dir, "release-log.json");
    writeFileSync(file, JSON.stringify(LOG));
    expect(await other.recordOnStartup({ sha: undefined, logPath: file })).toBe("skipped");
    expect(await other.recordOnStartup({ sha: "abcdef1", logPath: path.join(dir, "missing.json") })).toBe("recorded");
    expect(await other.recordOnStartup({ sha: sha(5), logPath: file })).toBe("recorded");
    expect((await other.list())[0]!.notes).toHaveLength(4); // vorige versie staat niet in het log: hooguit 30
    expect(JSON.parse(readFileSync(file, "utf8"))).toHaveLength(4);
    expect(() => other.record("not-a-sha", LOG)).toThrow();
  });
});
