CREATE TABLE "subscription_provider_event_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"external_provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"normalized_event_digest" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_event_receipt_digest_check" CHECK (normalized_event_digest ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "subscription_event_receipt_outcome_check" CHECK (outcome IN ('applied', 'stale', 'conflict', 'invalid-transition'))
);
--> statement-breakpoint
ALTER TABLE "subscription_provider_event_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_provider_event_receipt" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON "subscription_provider_event_receipt" TO app_user;--> statement-breakpoint
ALTER TABLE "subscription_provider_event_receipt" ADD CONSTRAINT "subscription_event_receipt_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_event_receipt_provider_event_uidx" ON "subscription_provider_event_receipt" USING btree ("external_provider" text_ops,"provider_event_id" text_ops);--> statement-breakpoint
CREATE INDEX "subscription_event_receipt_subscription_idx" ON "subscription_provider_event_receipt" USING btree ("subscription_id" uuid_ops);--> statement-breakpoint
CREATE POLICY "subscription_event_receipt_owner" ON "subscription_provider_event_receipt" AS PERMISSIVE FOR ALL TO "app_user" USING (EXISTS (SELECT 1 FROM subscription WHERE subscription.id = subscription_provider_event_receipt.subscription_id AND subscription.user_account_id = app.current_user_id())) WITH CHECK (EXISTS (SELECT 1 FROM subscription WHERE subscription.id = subscription_provider_event_receipt.subscription_id AND subscription.user_account_id = app.current_user_id()));
