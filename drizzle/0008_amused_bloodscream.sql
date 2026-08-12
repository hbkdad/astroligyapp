CREATE ROLE app_auth_email_feedback_consumer NOLOGIN;--> statement-breakpoint
GRANT app_auth_email_feedback_consumer TO CURRENT_USER;--> statement-breakpoint
CREATE TABLE "authentication_email_feedback_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid,
	"event_key_version" integer NOT NULL,
	"event_digest" text NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authentication_email_feedback_key_version_check" CHECK (event_key_version >= 0),
	CONSTRAINT "authentication_email_feedback_digest_check" CHECK (event_digest ~ '^hmac-sha256:[0-9]+:[0-9a-f]{64}$' AND split_part(event_digest, ':', 2)::integer = event_key_version),
	CONSTRAINT "authentication_email_feedback_type_check" CHECK (event_type IN ('delivery', 'bounce', 'complaint', 'reject', 'delay', 'render-failure')),
	CONSTRAINT "authentication_email_feedback_outcome_check" CHECK (outcome IN ('applied', 'stale', 'unmatched')),
	CONSTRAINT "authentication_email_feedback_timeline_check" CHECK (occurred_at <= received_at + interval '5 minutes')
);
--> statement-breakpoint
ALTER TABLE "authentication_email_feedback_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "authentication_email_feedback_receipt" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "authentication_email_feedback_receipt" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON "authentication_email_feedback_receipt" TO app_auth_email_feedback_consumer;--> statement-breakpoint
CREATE TABLE "authentication_email_suppression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_key_version" integer NOT NULL,
	"recipient_digest" text NOT NULL,
	"reason" text NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authentication_email_suppression_key_version_check" CHECK (recipient_key_version >= 0),
	CONSTRAINT "authentication_email_suppression_digest_check" CHECK (recipient_digest ~ '^hmac-sha256:[0-9]+:[0-9a-f]{64}$' AND split_part(recipient_digest, ':', 2)::integer = recipient_key_version),
	CONSTRAINT "authentication_email_suppression_reason_check" CHECK (reason IN ('permanent-bounce', 'complaint'))
);
--> statement-breakpoint
ALTER TABLE "authentication_email_suppression" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "authentication_email_suppression" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "authentication_email_suppression" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON "authentication_email_suppression" TO app_auth_email_feedback_consumer;--> statement-breakpoint
GRANT SELECT, UPDATE ON "authentication_email_delivery" TO app_auth_email_feedback_consumer;--> statement-breakpoint
ALTER TABLE "authentication_email_delivery" DROP CONSTRAINT "authentication_email_delivery_state_check";--> statement-breakpoint
ALTER TABLE "authentication_email_delivery" DROP CONSTRAINT "authentication_email_delivery_lifecycle_check";--> statement-breakpoint
ALTER TABLE "authentication_email_feedback_receipt" ADD CONSTRAINT "authentication_email_feedback_delivery_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."authentication_email_delivery"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "authentication_email_feedback_event_uidx" ON "authentication_email_feedback_receipt" USING btree ("event_digest" text_ops);--> statement-breakpoint
CREATE INDEX "authentication_email_feedback_delivery_idx" ON "authentication_email_feedback_receipt" USING btree ("delivery_id" uuid_ops,"occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "authentication_email_feedback_retention_idx" ON "authentication_email_feedback_receipt" USING btree ("received_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "authentication_email_suppression_recipient_uidx" ON "authentication_email_suppression" USING btree ("recipient_digest" text_ops);--> statement-breakpoint
CREATE INDEX "authentication_email_suppression_retention_idx" ON "authentication_email_suppression" USING btree ("suppressed_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "authentication_email_delivery_provider_reference_uidx" ON "authentication_email_delivery" USING btree ("provider_message_reference" text_ops) WHERE provider_message_reference IS NOT NULL;--> statement-breakpoint
ALTER TABLE "authentication_email_delivery" ADD CONSTRAINT "authentication_email_delivery_state_check" CHECK (state IN ('reserved', 'accepted', 'rejected', 'retry', 'reconciliation-required', 'suppressed', 'delivered', 'transient-bounce', 'permanent-bounce', 'complaint', 'delivery-delayed', 'provider-rejected', 'rendering-failed'));--> statement-breakpoint
ALTER TABLE "authentication_email_delivery" ADD CONSTRAINT "authentication_email_delivery_lifecycle_check" CHECK ((state = 'reserved' AND completed_at IS NULL AND provider_message_reference IS NULL) OR (state IN ('accepted', 'delivered', 'transient-bounce', 'permanent-bounce', 'complaint', 'delivery-delayed', 'provider-rejected', 'rendering-failed') AND completed_at IS NOT NULL AND provider_message_reference IS NOT NULL) OR (state IN ('rejected', 'retry', 'suppressed') AND completed_at IS NOT NULL AND provider_message_reference IS NULL) OR (state = 'reconciliation-required' AND completed_at IS NOT NULL));--> statement-breakpoint
CREATE POLICY "authentication_email_feedback_consumer" ON "authentication_email_feedback_receipt" AS PERMISSIVE FOR ALL TO "app_auth_email_feedback_consumer" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "authentication_email_suppression_consumer" ON "authentication_email_suppression" AS PERMISSIVE FOR ALL TO "app_auth_email_feedback_consumer" USING (true) WITH CHECK (true);
