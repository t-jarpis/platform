import { createHash, createHmac } from "node:crypto";
import type { AnalyticsDefinition, ClientEvent, Device, EventInput } from "./define.js";

export { defineAnalytics, DEVICES, ITEM_PATTERN, PAGE_VIEW } from "./define.js";
export type { AnalyticsDefinition, AnalyticsOptions, ClientEvent, Device, EventInput, EventSpec } from "./define.js";

/**
 * Bots, crawlers, previews en geautomatiseerde browsers (ook eigen rooktests) tellen niet mee. Alleen herkenning
 * op de user agent; die wordt nergens bewaard.
 */
const BOT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|ptst|playwright|puppeteer|selenium|phantom|preview|inspectiontool|facebookexternalhit|embedly|quora link|whatsapp|python|curl|wget|httpclient|okhttp|go-http|java\/|node-fetch|axios|monitor|uptime|pingdom|statuscake|datadog|ahrefs|semrush|mj12|dotbot|petal|bytespider|gptbot|claude|anthropic|perplexity|ccbot/i;
export const isBot = (ua: string): boolean => !ua.trim() || BOT.test(ua);

/** Soort apparaat uit de user agent. */
export function device(ua: string): Device {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  if (/mozilla|chrome|safari|firefox/i.test(ua)) return "desktop";
  return "other";
}

/**
 * Bezoekerscode met het zout van die dag (UTC): HMAC van de dag met het geheim, daarna een hash van zout,
 * IP-adres en user agent. Over dagen heen niet te koppelen. Het IP-adres en de browser zelf gaan nergens heen.
 */
export function visitorHash(input: { ip: string; userAgent: string; secret: string; now?: Date }): string {
  if (input.secret.length < 16) throw new Error("Het zoutgeheim moet minstens 16 tekens hebben");
  const day = (input.now ?? new Date()).toISOString().slice(0, 10);
  const salt = createHmac("sha256", input.secret).update(day).digest();
  return createHash("sha256").update(salt).update(input.ip).update(input.userAgent).digest("base64url").slice(0, 32);
}

/** IP-adres, user agent en land uit de headers van een verzoek via Cloudflare (of een andere proxy). */
export function requestInfo(headers: Headers): { ip: string; userAgent: string; country: string | undefined } {
  const ip = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const country = (headers.get("cf-ipcountry") ?? "").toUpperCase();
  return { ip, userAgent: headers.get("user-agent") ?? "", country: /^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1" ? country : undefined };
}

/** Alleen de hostnaam van een verwijzer, zonder `www.`; '' als hij leeg is, ongeldig, of een van de eigen hosts. */
export function referrerHost(ref: string | undefined, ownHosts: readonly string[] = []): string {
  if (!ref) return "";
  try {
    const host = new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
    if (!/^([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/.test(host) || host.length > 100) return "";
    return ownHosts.some((h) => h.toLowerCase().replace(/^www\./, "") === host) ? "" : host;
  } catch { return ""; }
}

/** Controleert wat een browser naar `/e` stuurde tegen de definitie van de site. `null` = weigeren. */
export function parseClientEvent<T extends string>(body: unknown, config: AnalyticsDefinition<T>): ClientEvent<T> | null {
  const parsed = config.ClientEvent.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * Maakt van een browserevent een event voor de API: apparaat, land en bezoekerscode komen van de server.
 * `null` voor bots (die tellen niet).
 */
export function toEvent<T extends string>(client: ClientEvent<T>, request: { headers: Headers }, options: { secret: string; segment?: string; ownHosts?: readonly string[]; devCountry?: string; now?: Date }): EventInput<T> | null {
  const info = requestInfo(request.headers);
  if (isBot(info.userAgent)) return null;
  const country = info.country ?? (options.devCountry && /^[A-Z]{2}$/.test(options.devCountry) ? options.devCountry : undefined);
  return {
    type: client.type, market: client.market, device: device(info.userAgent),
    visitorHash: visitorHash({ ip: info.ip, userAgent: info.userAgent, secret: options.secret, ...(options.now ? { now: options.now } : {}) }),
    ...(client.item !== undefined ? { item: client.item } : {}),
    ...(client.variant !== undefined ? { variant: client.variant } : {}),
    ...(client.page !== undefined ? { page: client.page } : {}),
    ...(client.entry !== undefined ? { entry: client.entry, referrer: referrerHost(client.ref, options.ownHosts) } : {}),
    ...(options.segment ? { segment: options.segment } : {}),
    ...(country ? { country } : {}),
  };
}

export interface SendOptions {
  /** Basisadres van de API, bijvoorbeeld `http://api:3001`. */
  apiUrl: string;
  /** Gedeelde sleutel voor `x-ingest-key`. */
  ingestKey: string;
  /** Pad op de API. Standaard `/v1/internal/events`. */
  path?: string;
  /** Wachttijden vóór de nieuwe pogingen, in ms. Standaard 300 en 1200 (drie pogingen). */
  waits?: readonly number[];
  /** Time-out per poging in ms. Standaard 3000. */
  timeoutMs?: number;
  /** Label voor de logregel bij mislukken (geen bezoekersgegevens). */
  label?: string;
  fetch?: typeof fetch;
  /** Standaard `console.warn`. */
  warn?: (message: string) => void;
}

/**
 * Stuurt events naar de API, met nieuwe pogingen als dat mislukt: een hapering van de API (503, time-out)
 * mag geen telling stil kosten. Een 4xx (behalve 429) is een fout in het event zelf: niet opnieuw. Lukt het
 * niet, dan één logregel zonder bezoekersgegevens. Gooit nooit: tellen mag de site niet breken.
 */
export async function send(batch: readonly EventInput[], options: SendOptions): Promise<boolean> {
  if (!batch.length) return true;
  const waits = options.waits ?? [300, 1200];
  const doFetch = options.fetch ?? fetch;
  const body = JSON.stringify(batch);
  let last = "";
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, waits[attempt - 1]));
    try {
      const res = await doFetch(`${options.apiUrl.replace(/\/$/, "")}${options.path ?? "/v1/internal/events"}`, {
        method: "POST", headers: { "content-type": "application/json", "x-ingest-key": options.ingestKey }, body,
        signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
      });
      if (res.ok) return true;
      last = `HTTP ${res.status}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
    } catch (e) { last = (e as Error)?.name ?? "fout"; }
  }
  (options.warn ?? console.warn)(`Telling ${options.label ?? batch[0]?.type ?? ""} niet doorgegeven aan de API (${last})`);
  return false;
}
