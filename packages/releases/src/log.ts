import { z } from "zod";

/** Eén commit uit het releaselog (nieuwste eerst), gemaakt bij het bouwen met `release-log`. */
export const LogEntry = z.object({
  sha: z.string().regex(/^[0-9a-f]{7,64}$/),
  date: z.string(),
  subject: z.string(),
  /** Tekst uit de trailer `Release-note:` (in de taal van het beheer); '' = technische wijziging. */
  note: z.string().default(""),
  /** Tekst uit de trailer `Public-note:` voor bezoekers; '' = niets voor bezoekers. */
  public: z.string().default(""),
});
export type LogEntry = z.infer<typeof LogEntry>;

/** Eén regel releasenotes. `technical` = zonder `Release-note:`, met het onderwerp van de commit als tekst. */
export interface ReleaseNote { sha: string; date: string; text: string; technical: boolean; public?: string }

/** Standaardnamen van de trailers. */
export const NOTE_TRAILER = "Release-note";
export const PUBLIC_TRAILER = "Public-note";

/** Hoeveel commits een eerste release (of een onbekende vorige versie) hooguit laat zien. */
export const FIRST_LIMIT = 30;

/** Leest een releaselog (JSON); ongeldige of ontbrekende inhoud geeft een lege lijst. */
export function parseReleaseLog(json: unknown): LogEntry[] {
  const parsed = z.array(LogEntry).safeParse(typeof json === "string" ? safeJson(json) : json);
  return parsed.success ? parsed.data : [];
}
function safeJson(text: string): unknown { try { return JSON.parse(text); } catch { return null; } }

/**
 * Leest de waarde van een trailer (`Sleutel: waarde`) uit een volledig commitbericht. Alleen het laatste
 * blok regels telt, zoals bij git; meerdere regels met dezelfde sleutel worden met een spatie samengevoegd.
 */
export function readTrailer(message: string, key: string): string {
  const blocks = message.trim().split(/\n\s*\n/);
  if (blocks.length < 2) return "";
  const last = (blocks.at(-1) ?? "").split("\n");
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.*)$`, "i");
  return last.map((l) => re.exec(l.trim())?.[1]?.trim() ?? "").filter(Boolean).join(" ");
}

/** Opmaak voor `git log --format`: velden gescheiden door \x1f, commits door \x1e. */
export function gitLogFormat(noteKey = NOTE_TRAILER, publicKey = PUBLIC_TRAILER): string {
  return `%H%x1f%cI%x1f%s%x1f%(trailers:key=${noteKey},valueonly,separator=%x20)%x1f%(trailers:key=${publicKey},valueonly,separator=%x20)%x1e`;
}

/** Zet de uitvoer van `git log --format=<gitLogFormat()>` om in een releaselog. */
export function parseGitLog(output: string): LogEntry[] {
  return output.split("\x1e").map((r) => r.replace(/^\n+/, "")).filter((r) => r.trim()).map((r) => {
    const [sha = "", date = "", subject = "", note = "", pub = ""] = r.split("\x1f");
    return { sha: sha.trim(), date: date.trim(), subject: subject.trim(), note: note.trim(), public: pub.trim() };
  });
}

/**
 * Notes voor een nieuwe versie: de commits van `sha` terug tot (niet met) `previous`. Een commit met de
 * trailer `Release-note:` toont die tekst; zonder trailer het onderwerp, als technisch. Is `previous`
 * onbekend (of leeg), dan hooguit `firstLimit` commits.
 */
export function notesBetween(log: readonly LogEntry[], sha: string, previous: string | null, firstLimit = FIRST_LIMIT): ReleaseNote[] {
  const from = log.findIndex((c) => c.sha === sha);
  if (from < 0) return [];
  const to = previous ? log.findIndex((c) => c.sha === previous) : -1;
  const slice = to > from ? log.slice(from, to) : log.slice(from, from + firstLimit);
  return slice.map((c) => ({
    sha: c.sha, date: c.date, text: c.note.trim() || c.subject, technical: !c.note.trim(),
    ...(c.public.trim() ? { public: c.public.trim() } : {}),
  }));
}

/**
 * Teksten voor bezoekers ("wat is er nieuw"): de `public`-notes per uitrol, nieuwste eerst, zonder
 * herhalingen. Verwacht releases nieuwste eerst.
 */
export function publicNotes(releases: readonly { startedAt: Date; notes: readonly ReleaseNote[] }[], limit = 20): { date: string; notes: string[] }[] {
  const seen = new Set<string>();
  const out: { date: string; notes: string[] }[] = [];
  for (const r of releases) {
    const notes = r.notes.map((n) => n.public?.trim() ?? "").filter((n) => n && !seen.has(n));
    notes.forEach((n) => seen.add(n));
    if (notes.length) out.push({ date: r.startedAt.toISOString().slice(0, 10), notes });
    if (out.length >= limit) break;
  }
  return out;
}
