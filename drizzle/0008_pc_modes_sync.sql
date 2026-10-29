CREATE TYPE "public"."pc_mode" AS ENUM('CLOUD', 'LOCAL', 'SYNC');--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sync_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"row_key" text NOT NULL,
	"organization_id" uuid,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "sync_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "sync_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "installations" ADD COLUMN "last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_licenses" ADD COLUMN "mode" "pc_mode" DEFAULT 'LOCAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_licenses" ADD COLUMN "sync_pulled" jsonb;--> statement-breakpoint
ALTER TABLE "org_licenses" ADD COLUMN "sync_pushed" jsonb;--> statement-breakpoint
ALTER TABLE "org_licenses" ADD COLUMN "last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_licenses" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "pc_mode" "pc_mode" DEFAULT 'CLOUD' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "sync_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "sync_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "sync_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "sync_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_restaurants" ADD COLUMN "sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_restaurants" ADD COLUMN "sync_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sync_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_deletions_org_idx" ON "sync_deletions" USING btree ("organization_id","deleted_at");--> statement-breakpoint
-- ───────── Sincronización PC ↔ nube (modo SYNC) ─────────
-- sync_seq: orden de los cambios en ESTA base. sync_updated_at: cuándo cambió el renglón (gana el más reciente).
-- Mientras se aplican cambios que llegaron del otro lado, la app pone sobremesa.sync_apply:
--   'pc'    (en la PC): no se marcan como cambios propios (no se vuelven a subir) ni se registran borrados.
--   'cloud' (en la nube): se conserva sync_updated_at, pero sí se numeran (para otras PCs del mismo cliente).
CREATE SEQUENCE IF NOT EXISTS "sync_change_seq";--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_touch() RETURNS trigger AS $$
DECLARE applying text := coalesce(current_setting('sobremesa.sync_apply', true), '');
BEGIN
  IF applying = 'pc' THEN
    NEW.sync_seq := 0;
  ELSE
    NEW.sync_seq := nextval('sync_change_seq');
  END IF;
  IF applying = '' THEN
    NEW.sync_updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_record_delete() RETURNS trigger AS $$
DECLARE applying text := coalesce(current_setting('sobremesa.sync_apply', true), '');
DECLARE org uuid;
DECLARE k text;
BEGIN
  IF applying = 'pc' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME IN ('restaurants', 'users') THEN
    org := OLD.organization_id; k := OLD.id::text;
  ELSIF TG_TABLE_NAME IN ('surveys', 'devices') THEN
    SELECT organization_id INTO org FROM restaurants WHERE id = OLD.restaurant_id; k := OLD.id::text;
  ELSIF TG_TABLE_NAME = 'questions' THEN
    SELECT r.organization_id INTO org FROM surveys s JOIN restaurants r ON r.id = s.restaurant_id WHERE s.id = OLD.survey_id;
    k := OLD.id::text;
  ELSIF TG_TABLE_NAME = 'user_restaurants' THEN
    SELECT organization_id INTO org FROM users WHERE id = OLD.user_id; k := OLD.user_id::text || ':' || OLD.restaurant_id::text;
  END IF;
  -- Sin cadena (el padre ya se borró, p. ej. en cascada): basta con el borrado del padre.
  IF org IS NOT NULL THEN
    INSERT INTO sync_deletions (table_name, row_key, organization_id, sync_seq) VALUES (TG_TABLE_NAME, k, org, nextval('sync_change_seq'));
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['restaurants','users','user_restaurants','surveys','questions','devices','responses','answers'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sync_touch()', t || '_sync_touch', t);
    EXECUTE format('UPDATE %I SET sync_seq = nextval(''sync_change_seq'')', t);
    EXECUTE format('CREATE INDEX %I ON %I (sync_seq)', t || '_sync_seq_idx', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['restaurants','users','user_restaurants','surveys','questions','devices'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sync_record_delete()', t || '_sync_delete', t);
  END LOOP;
END $$;
