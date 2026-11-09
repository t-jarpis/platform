import { describe, expect, it, vi } from "vitest";
import { defineAnalytics, device, isBot, parseClientEvent, referrerHost, send, toEvent, visitorHash } from "./web.js";

const config = defineAnalytics({
  events: { puzzle_view: { item: /^grid:[a-z]+$/, itemRequired: true } },
  pages: ["home"],
  entries: ["nl"],
});
const SECRET = "test-secret-0123456789";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe("web", () => {
  it("herkent apparaten en bots", () => {
    expect(device(CHROME)).toBe("desktop");
    expect(device(IPHONE)).toBe("mobile");
    expect(device("Mozilla/5.0 (iPad; CPU OS 18_0)")).toBe("tablet");
    expect(device("something")).toBe("other");
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/130.0")).toBe(true);
    expect(isBot(CHROME)).toBe(false);
  });

  it("maakt een bezoekerscode die per dag wisselt", () => {
    const a = visitorHash({ ip: "192.0.2.1", userAgent: CHROME, secret: SECRET, now: new Date("2026-11-09T01:00:00Z") });
    const b = visitorHash({ ip: "192.0.2.1", userAgent: CHROME, secret: SECRET, now: new Date("2026-11-09T23:00:00Z") });
    const c = visitorHash({ ip: "192.0.2.1", userAgent: CHROME, secret: SECRET, now: new Date("2026-11-10T01:00:00Z") });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toContain("192");
    expect(() => visitorHash({ ip: "", userAgent: "", secret: "short" })).toThrow();
  });

  it("houdt van een verwijzer alleen een vreemde hostnaam over", () => {
    expect(referrerHost("https://www.search.example/q?term=secret")).toBe("search.example");
    expect(referrerHost("https://www.site.example/page", ["site.example"])).toBe("");
    expect(referrerHost("not a url")).toBe("");
    expect(referrerHost(undefined)).toBe("");
  });

  it("maakt van een browserevent een event voor de API", () => {
    const client = parseClientEvent({ type: "page_view", market: "nl-NL", page: "home", entry: "nl", ref: "https://other.example/x" }, config);
    expect(client).not.toBeNull();
    const headers = new Headers({ "user-agent": IPHONE, "cf-connecting-ip": "192.0.2.1", "cf-ipcountry": "nl" });
    const e = toEvent(client!, { headers }, { secret: SECRET, now: new Date("2026-11-09T10:00:00Z") });
    expect(e).toMatchObject({ type: "page_view", market: "nl-NL", device: "mobile", page: "home", entry: "nl", referrer: "other.example", country: "NL" });
    expect(config.EventInput.safeParse(e).success).toBe(true);
    expect(toEvent(client!, { headers: new Headers({ "user-agent": "curl/8" }) }, { secret: SECRET })).toBeNull();
    expect(parseClientEvent({ type: "puzzle_view", market: "nl-NL", item: "grid:1234567" }, config)).toBeNull();
    expect(parseClientEvent({ type: "page_view", market: "nl-NL", visitorHash: "x".repeat(20) }, config)).toBeNull();
  });

  it("probeert opnieuw bij een storing, niet bij een fout event", async () => {
    const batch = [{ type: "page_view", market: "nl-NL", device: "desktop" as const }];
    const flaky = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockRejectedValueOnce(new TypeError("net")).mockResolvedValueOnce(new Response(null, { status: 202 }));
    expect(await send(batch, { apiUrl: "http://api/", ingestKey: "k", waits: [1, 1], fetch: flaky })).toBe(true);
    expect(flaky).toHaveBeenCalledTimes(3);
    expect(flaky.mock.calls[0]![0]).toBe("http://api/v1/internal/events");
    expect(flaky.mock.calls[0]![1].headers["x-ingest-key"]).toBe("k");

    const warn = vi.fn();
    const bad = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    expect(await send(batch, { apiUrl: "http://api", ingestKey: "k", waits: [1, 1], fetch: bad, warn })).toBe(false);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Telling page_view niet doorgegeven aan de API (HTTP 400)");

    const down = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    expect(await send(batch, { apiUrl: "http://api", ingestKey: "k", waits: [1, 1], fetch: down, warn })).toBe(false);
    expect(down).toHaveBeenCalledTimes(3);
  });
});
