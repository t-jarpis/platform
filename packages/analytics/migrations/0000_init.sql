CREATE SCHEMA IF NOT EXISTS "analytics";
--> statement-breakpoint
CREATE TABLE "analytics"."aggregated_days" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"aggregated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "aggregated_days_tenant_id_day_pk" PRIMARY KEY("tenant_id","day")
);
--> statement-breakpoint
CREATE TABLE "analytics"."daily_counts" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"type" text NOT NULL,
	"item" text NOT NULL,
	"variant" text NOT NULL,
	"segment" text NOT NULL,
	"market" text NOT NULL,
	"country" text NOT NULL,
	"count" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "daily_counts_tenant_id_day_type_item_variant_segment_market_country_pk" PRIMARY KEY("tenant_id","day","type","item","variant","segment","market","country")
);
--> statement-breakpoint
CREATE TABLE "analytics"."daily_pages" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"segment" text NOT NULL,
	"page" text NOT NULL,
	"market" text NOT NULL,
	"device" text NOT NULL,
	"views" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "daily_pages_tenant_id_day_segment_page_market_device_pk" PRIMARY KEY("tenant_id","day","segment","page","market","device")
);
--> statement-breakpoint
CREATE TABLE "analytics"."daily_sources" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"segment" text NOT NULL,
	"entry" text NOT NULL,
	"referrer" text NOT NULL,
	"landings" integer NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "daily_sources_tenant_id_day_segment_entry_referrer_pk" PRIMARY KEY("tenant_id","day","segment","entry","referrer")
);
--> statement-breakpoint
CREATE TABLE "analytics"."daily_visitors" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"segment" text NOT NULL,
	"visitors" integer NOT NULL,
	CONSTRAINT "daily_visitors_tenant_id_day_segment_pk" PRIMARY KEY("tenant_id","day","segment")
);
--> statement-breakpoint
CREATE TABLE "analytics"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"item" text,
	"variant" text,
	"market" text NOT NULL,
	"country" text,
	"device" text NOT NULL,
	"visitor_hash" text,
	"page" text,
	"segment" text NOT NULL,
	"entry" text,
	"referrer" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_tenant_time" ON "analytics"."events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_tenant_created" ON "analytics"."events" USING btree ("tenant_id","created_at");