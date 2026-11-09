import { z } from "zod";

/** Soort apparaat, afgeleid van de user agent (die zelf nergens wordt bewaard). */
export const DEVICES = ["mobile", "tablet", "desktop", "other"] as const;
export type Device = (typeof DEVICES)[number];

/** Het ene event dat het platform zelf kent: een paginaweergave. Basis voor pagina's, bezoekers en bronnen. */
export const PAGE_VIEW = "page_view";
/** Segment in `daily_visitors` voor de hele site (alle segmenten samen). */
export const ALL_SEGMENTS = "*";

/**
 * Een item is een begrensde sleutel: één of twee delen van kleine letters, cijfers en streepjes, gescheiden
 * door een dubbele punt (`soort:niveau`). Nooit een seed, id of adres: dan groeit het aantal items onbeperkt.
 */
export const ITEM_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}(?::[a-z0-9][a-z0-9-]{0,31})?$/;
/** Zes of meer cijfers achter elkaar lijkt op een seed of id; zo'n item wordt geweigerd. */
const LOOKS_LIKE_ID = /\d{6,}/;
const KEY = /^[a-z][a-z0-9-]{0,31}$/;
const SEGMENT = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const TYPE = /^[a-z][a-z0-9_]{1,39}$/;
const HOST = /^$|^([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/;

/** Wat een site over één soort event zegt. */
export interface EventSpec {
  /** Item toegestaan en aan deze vorm gebonden (bovenop `ITEM_PATTERN`). Leeg = geen item. */
  item?: RegExp;
  /** Item verplicht. */
  itemRequired?: boolean;
  /** Toegestane varianten (bijvoorbeeld een speciale uitvoering); een vaste, korte lijst. */
  variants?: readonly string[];
}

export interface AnalyticsOptions<T extends string> {
  /** Eigen soorten events van de site. `page_view` bestaat altijd en hoort hier niet bij. */
  events: Record<T, EventSpec>;
  /** Toegestane soorten pagina bij `page_view` (geen adressen). */
  pages: readonly string[];
  /** Toegestane ingangen voor een binnenkomst (bijvoorbeeld domeinen of talen). */
  entries: readonly string[];
  /** Toegestane segmenten (bijvoorbeeld organisaties). Leeg = alleen `defaultSegment`. */
  segments?: readonly string[];
  /** Segment als een event er geen heeft. Standaard `main`. */
  defaultSegment?: string;
  /** Toegestane markten (`nl-NL`). Leeg = elke markt van de vorm `xx-XX`. */
  markets?: readonly string[];
  /** Tijdzone voor "wanneer" (weekdag × uur). Standaard `Europe/Amsterdam`. */
  timeZone?: string;
}

export interface AnalyticsDefinition<T extends string = string> {
  readonly types: readonly (T | typeof PAGE_VIEW)[];
  readonly events: Readonly<Record<string, EventSpec>>;
  readonly pages: readonly string[];
  readonly entries: readonly string[];
  readonly segments: readonly string[];
  readonly defaultSegment: string;
  readonly markets: readonly string[];
  readonly timeZone: string;
  /** Eén event zoals de website het aan de API levert. */
  readonly EventInput: z.ZodType<EventInput<T>>;
  /** 1 tot 100 events. */
  readonly EventBatch: z.ZodType<EventInput<T>[]>;
  /** Het deel dat een browser zelf mag aanleveren (voor de `/e`-route). */
  readonly ClientEvent: z.ZodType<ClientEvent<T>>;
}

/** Eén event aan de API: zonder IP-adres of user agent; land en apparaat al bepaald. */
export interface EventInput<T extends string = string> {
  type: T | typeof PAGE_VIEW;
  item?: string | undefined;
  variant?: string | undefined;
  market: string;
  country?: string | undefined;
  device: Device;
  visitorHash?: string | undefined;
  occurredAt?: string | undefined;
  page?: string | undefined;
  segment?: string | undefined;
  entry?: string | undefined;
  referrer?: string | undefined;
}

/** Wat de browser naar `/e` stuurt. De server voegt apparaat, land, bezoekerscode en segment toe. */
export interface ClientEvent<T extends string = string> {
  type: T | typeof PAGE_VIEW;
  item?: string | undefined;
  variant?: string | undefined;
  market: string;
  page?: string | undefined;
  entry?: string | undefined;
  /** `document.referrer`; de server houdt alleen de hostnaam over. */
  ref?: string | undefined;
}

function checkSpec(spec: EventSpec | undefined, e: { type: string; item?: string | undefined; variant?: string | undefined; page?: string | undefined }, ctx: z.RefinementCtx, pages: readonly string[]) {
  if (!spec) { ctx.addIssue({ code: "custom", message: `Onbekende soort event: ${e.type}`, path: ["type"] }); return; }
  if (e.item !== undefined) {
    if (!spec.item) ctx.addIssue({ code: "custom", message: `${e.type} heeft geen item`, path: ["item"] });
    else if (!ITEM_PATTERN.test(e.item) || LOOKS_LIKE_ID.test(e.item) || !spec.item.test(e.item)) ctx.addIssue({ code: "custom", message: "Ongeldig item", path: ["item"] });
  } else if (spec.itemRequired) ctx.addIssue({ code: "custom", message: `${e.type} vraagt een item`, path: ["item"] });
  if (e.variant !== undefined && !spec.variants?.includes(e.variant)) ctx.addIssue({ code: "custom", message: "Ongeldige variant", path: ["variant"] });
  if (e.type === PAGE_VIEW && e.page !== undefined && !pages.includes(e.page)) ctx.addIssue({ code: "custom", message: "Onbekende soort pagina", path: ["page"] });
  if (e.type !== PAGE_VIEW && e.page !== undefined) ctx.addIssue({ code: "custom", message: "Alleen page_view heeft een pagina", path: ["page"] });
}

/**
 * Maakt de definitie van de analytics van een site: welke events, pagina's, ingangen en segmenten er
 * bestaan, met de zod-schema's om aanlevering te controleren. Alles daarbuiten wordt geweigerd.
 */
export function defineAnalytics<T extends string>(options: AnalyticsOptions<T>): AnalyticsDefinition<T> {
  const own = Object.keys(options.events) as T[];
  if ((own as string[]).includes(PAGE_VIEW)) throw new Error("page_view bestaat al; geef hem niet zelf op");
  for (const t of own) if (!TYPE.test(t)) throw new Error(`Ongeldige soort event: ${t}`);
  for (const p of options.pages) if (!KEY.test(p)) throw new Error(`Ongeldige soort pagina: ${p}`);
  for (const e of options.entries) if (!KEY.test(e)) throw new Error(`Ongeldige ingang: ${e}`);
  const defaultSegment = options.defaultSegment ?? "main";
  const segments = [...new Set([defaultSegment, ...(options.segments ?? [])])];
  for (const s of segments) if (!SEGMENT.test(s)) throw new Error(`Ongeldig segment: ${s}`);
  for (const [t, spec] of Object.entries<EventSpec>(options.events)) {
    for (const v of spec.variants ?? []) if (!KEY.test(v)) throw new Error(`Ongeldige variant ${v} bij ${t}`);
    if (spec.itemRequired && !spec.item) throw new Error(`${t}: itemRequired zonder item-vorm`);
  }
  const markets = options.markets ?? [];
  const timeZone = options.timeZone ?? "Europe/Amsterdam";
  try { new Intl.DateTimeFormat("en", { timeZone }); } catch { throw new Error(`Onbekende tijdzone: ${timeZone}`); }

  const specs: Record<string, EventSpec> = { ...options.events, [PAGE_VIEW]: {} };
  const types = [PAGE_VIEW, ...own] as (T | typeof PAGE_VIEW)[];
  const typeEnum = z.string().refine((t) => t in specs, "Onbekende soort event");
  const market = z.string().regex(/^[a-z]{2}-[A-Z]{2}$/).refine((m) => !markets.length || markets.includes(m), "Onbekende markt");
  const entry = z.string().refine((e) => options.entries.includes(e), "Onbekende ingang");

  const EventInput = z.object({
    type: typeEnum,
    item: z.string().max(65).optional(),
    variant: z.string().max(32).optional(),
    market,
    country: z.string().regex(/^[A-Z]{2}$/).optional(),
    device: z.enum(DEVICES),
    visitorHash: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
    occurredAt: z.iso.datetime().optional(),
    page: z.string().max(32).optional(),
    segment: z.string().refine((s) => segments.includes(s), "Onbekend segment").optional(),
    entry: entry.optional(),
    referrer: z.string().max(100).regex(HOST).optional(),
  }).strict().superRefine((e, ctx) => {
    checkSpec(specs[e.type], e, ctx, options.pages);
    if (e.referrer !== undefined && e.entry === undefined) ctx.addIssue({ code: "custom", message: "Verwijzer alleen bij een binnenkomst", path: ["referrer"] });
    if (e.entry !== undefined && e.type !== PAGE_VIEW) ctx.addIssue({ code: "custom", message: "Binnenkomst alleen bij page_view", path: ["entry"] });
  }) as unknown as z.ZodType<EventInput<T>>;

  const ClientEvent = z.object({
    type: typeEnum,
    item: z.string().max(65).optional(),
    variant: z.string().max(32).optional(),
    market,
    page: z.string().max(32).optional(),
    entry: entry.optional(),
    ref: z.string().max(2048).optional(),
  }).strict().superRefine((e, ctx) => {
    checkSpec(specs[e.type], e, ctx, options.pages);
    if (e.entry !== undefined && e.type !== PAGE_VIEW) ctx.addIssue({ code: "custom", message: "Binnenkomst alleen bij page_view", path: ["entry"] });
  }) as unknown as z.ZodType<ClientEvent<T>>;

  return Object.freeze({
    types, events: Object.freeze(specs), pages: [...options.pages], entries: [...options.entries], segments, defaultSegment, markets: [...markets], timeZone,
    EventInput, EventBatch: z.array(EventInput).min(1).max(100), ClientEvent,
  });
}
