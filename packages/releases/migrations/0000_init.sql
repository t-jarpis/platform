CREATE SCHEMA IF NOT EXISTS "releases";
--> statement-breakpoint
CREATE TABLE "releases"."releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sha" text NOT NULL,
	"previous_sha" text,
	"kind" text NOT NULL,
	"notes" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "releases_tenant_started" ON "releases"."releases" USING btree ("tenant_id","started_at");