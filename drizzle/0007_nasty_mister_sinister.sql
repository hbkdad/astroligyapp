CREATE ROLE app_auth_email_runtime NOLOGIN;--> statement-breakpoint
GRANT app_auth_email_runtime TO CURRENT_USER;--> statement-breakpoint
CREATE TABLE "authentication_email_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"template_version" text NOT NULL,
	"reference_key_version" integer NOT NULL,
	"reference_digest" text NOT NULL,
	"request_digest" text NOT NULL,
	"state" text NOT NULL,
	"provider_message_reference" text,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authentication_email_delivery_purpose_check" CHECK (purpose IN ('verify-email', 'reset-password')),
	CONSTRAINT "authentication_email_delivery_template_check" CHECK ((purpose = 'verify-email' AND template_version = 'auth.verify-email.en-CA.1') OR (purpose = 'reset-password' AND template_version = 'auth.reset-password.en-CA.1')),
	CONSTRAINT "authentication_email_delivery_key_version_check" CHECK (reference_key_version >= 0),
	CONSTRAINT "authentication_email_delivery_reference_digest_check" CHECK (reference_digest ~ '^hmac-sha256:[0-9]+:[0-9a-f]{64}$'),
	CONSTRAINT "authentication_email_delivery_request_digest_check" CHECK (request_digest ~ '^hmac-sha256:[0-9]+:[0-9a-f]{64}$'),
	CONSTRAINT "authentication_email_delivery_digest_version_check" CHECK (split_part(reference_digest, ':', 2)::integer = reference_key_version AND split_part(request_digest, ':', 2)::integer = reference_key_version),
	CONSTRAINT "authentication_email_delivery_state_check" CHECK (state IN ('reserved', 'accepted', 'rejected', 'retry', 'reconciliation-required', 'suppressed')),
	CONSTRAINT "authentication_email_delivery_provider_reference_check" CHECK (provider_message_reference IS NULL OR (char_length(provider_message_reference) <= 200 AND provider_message_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')),
	CONSTRAINT "authentication_email_delivery_timeline_check" CHECK (reserved_at < lease_expires_at AND reserved_at <= updated_at AND (completed_at IS NULL OR (reserved_at <= completed_at AND completed_at <= updated_at))),
	CONSTRAINT "authentication_email_delivery_lifecycle_check" CHECK ((state = 'reserved' AND completed_at IS NULL AND provider_message_reference IS NULL) OR (state = 'accepted' AND completed_at IS NOT NULL AND provider_message_reference IS NOT NULL) OR (state IN ('rejected', 'retry', 'suppressed') AND completed_at IS NOT NULL AND provider_message_reference IS NULL) OR (state = 'reconciliation-required' AND completed_at IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "authentication_email_delivery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "authentication_email_delivery" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "authentication_email_delivery" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "authentication_email_delivery" TO app_auth_email_runtime;--> statement-breakpoint
CREATE UNIQUE INDEX "authentication_email_delivery_reference_uidx" ON "authentication_email_delivery" USING btree ("reference_digest" text_ops);--> statement-breakpoint
CREATE INDEX "authentication_email_delivery_recovery_idx" ON "authentication_email_delivery" USING btree ("state" text_ops,"lease_expires_at" timestamptz_ops);--> statement-breakpoint
CREATE POLICY "authentication_email_delivery_runtime" ON "authentication_email_delivery" AS PERMISSIVE FOR ALL TO "app_auth_email_runtime" USING (true) WITH CHECK (true);
