CREATE TYPE "public"."loyalty_kind" AS ENUM('EARN', 'REDEEM', 'ADJUST');--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"points_cost" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "loyalty_rewards_cost_positive" CHECK ("loyalty_rewards"."points_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"kind" "loyalty_kind" NOT NULL,
	"points" integer NOT NULL,
	"earn_day" text,
	"response_id" uuid,
	"reward_id" uuid,
	"reward_name" text,
	"note" text,
	"created_by_id" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "loyalty_transactions_response_id_unique" UNIQUE("response_id"),
	CONSTRAINT "loyalty_tx_points_sign" CHECK (("loyalty_transactions"."kind" = 'EARN' and "loyalty_transactions"."points" > 0 and "loyalty_transactions"."earn_day" is not null) or ("loyalty_transactions"."kind" = 'REDEEM' and "loyalty_transactions"."points" < 0) or ("loyalty_transactions"."kind" = 'ADJUST' and "loyalty_transactions"."points" <> 0)),
	CONSTRAINT "loyalty_tx_phone_format" CHECK ("loyalty_transactions"."phone" ~ '^[0-9]{10}$')
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "loyalty_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_reward_id_loyalty_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loyalty_rewards_organization_idx" ON "loyalty_rewards" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "loyalty_tx_phone_idx" ON "loyalty_transactions" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_tx_restaurant_idx" ON "loyalty_transactions" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_tx_one_earn_per_day" ON "loyalty_transactions" USING btree ("restaurant_id","phone","earn_day") WHERE "loyalty_transactions"."kind" = 'EARN';--> statement-breakpoint
-- Sincronización PC ↔ nube: las dos tablas nuevas se numeran igual que las demás (ver 0008).
-- No llevan trigger de borrado: los premios se desactivan y los movimientos de puntos nunca se borran.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['loyalty_rewards','loyalty_transactions'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sync_touch()', t || '_sync_touch', t);
    EXECUTE format('CREATE INDEX %I ON %I (sync_seq)', t || '_sync_seq_idx', t);
  END LOOP;
END $$;
