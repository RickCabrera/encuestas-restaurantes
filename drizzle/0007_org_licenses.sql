CREATE TABLE "org_licenses" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"installation_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"token" text,
	"block" text,
	"last_check_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "installations" ADD COLUMN "device_key_hash" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cloud_org_id" uuid;--> statement-breakpoint
ALTER TABLE "org_licenses" ADD CONSTRAINT "org_licenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_cloud_org_id_unique" UNIQUE("cloud_org_id");