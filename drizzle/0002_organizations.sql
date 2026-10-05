-- Multi-cadena. La migración corre en una sola transacción: si algo falla, no cambia nada.
-- Todo lo que ya existía (usuarios, restaurantes e invitaciones) queda en la cadena "Demo".
CREATE TYPE "public"."invite_kind" AS ENUM('USER', 'NEW_ORG');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "organizations" ("name") VALUES ('Demo');--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "signup_invites" ADD COLUMN "kind" "invite_kind" DEFAULT 'USER' NOT NULL;--> statement-breakpoint
ALTER TABLE "signup_invites" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE "restaurants" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "name" = 'Demo');--> statement-breakpoint
UPDATE "users" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "name" = 'Demo');--> statement-breakpoint
UPDATE "signup_invites" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "name" = 'Demo');--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_invites" ADD CONSTRAINT "signup_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "restaurants_organization_idx" ON "restaurants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "signup_invites_organization_idx" ON "signup_invites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_organization_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
-- Una invitación NEW_ORG todavía no tiene cadena (se crea al registrarse); todas las demás sí.
ALTER TABLE "signup_invites" ADD CONSTRAINT "signup_invites_org_matches_kind" CHECK (("signup_invites"."kind" = 'NEW_ORG') = ("signup_invites"."organization_id" is null));
