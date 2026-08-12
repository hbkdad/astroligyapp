CREATE TABLE "billing_customer_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_account_id" uuid NOT NULL,
	"external_provider" text NOT NULL,
	"external_customer_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customer_binding_provider_check" CHECK (char_length(external_provider) <= 64 AND external_provider ~ '^[a-z][a-z0-9_-]*$'),
	CONSTRAINT "billing_customer_binding_customer_check" CHECK (char_length(external_customer_reference) <= 200 AND external_customer_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
ALTER TABLE "billing_customer_binding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_customer_binding" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "billing_customer_binding" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON "billing_customer_binding" TO app_user;--> statement-breakpoint
REVOKE UPDATE, DELETE ON "billing_customer_binding" FROM app_user;--> statement-breakpoint
ALTER TABLE "billing_customer_binding" ADD CONSTRAINT "billing_customer_binding_user_account_id_user_account_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customer_binding_provider_customer_uidx" ON "billing_customer_binding" USING btree ("external_provider" text_ops,"external_customer_reference" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customer_binding_owner_provider_uidx" ON "billing_customer_binding" USING btree ("user_account_id" uuid_ops,"external_provider" text_ops);--> statement-breakpoint
CREATE INDEX "billing_customer_binding_owner_idx" ON "billing_customer_binding" USING btree ("user_account_id" uuid_ops);--> statement-breakpoint
CREATE POLICY "billing_customer_binding_owner" ON "billing_customer_binding" AS PERMISSIVE FOR ALL TO "app_user" USING ((user_account_id = app.current_user_id())) WITH CHECK ((user_account_id = app.current_user_id()));--> statement-breakpoint
CREATE ROLE app_billing_resolver NOLOGIN;--> statement-breakpoint
CREATE ROLE app_billing_resolver_owner NOLOGIN NOINHERIT;--> statement-breakpoint
GRANT app_billing_resolver TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_billing_resolver;--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA app TO app_billing_resolver_owner;--> statement-breakpoint
GRANT SELECT (user_account_id, external_provider, external_customer_reference)
  ON billing_customer_binding TO app_billing_resolver_owner;--> statement-breakpoint
GRANT SELECT (id, deleted_at)
  ON user_account TO app_billing_resolver_owner;--> statement-breakpoint
CREATE POLICY "billing_customer_binding_resolver_owner"
  ON billing_customer_binding FOR SELECT TO app_billing_resolver_owner
  USING (true);--> statement-breakpoint
CREATE POLICY "user_account_billing_resolver_owner"
  ON user_account FOR SELECT TO app_billing_resolver_owner
  USING (true);--> statement-breakpoint
CREATE FUNCTION app.resolve_billing_customer_owner(
  requested_provider text,
  requested_customer_reference text
) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT binding.user_account_id
  FROM public.billing_customer_binding AS binding
  JOIN public.user_account AS account
    ON account.id = binding.user_account_id
  WHERE account.deleted_at IS NULL
    AND char_length(requested_provider) <= 64
    AND requested_provider ~ '^[a-z][a-z0-9_-]*$'
    AND char_length(requested_customer_reference) <= 200
    AND requested_customer_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    AND binding.external_provider = requested_provider
    AND binding.external_customer_reference = requested_customer_reference
$function$;--> statement-breakpoint
GRANT app_billing_resolver_owner TO CURRENT_USER;--> statement-breakpoint
ALTER FUNCTION app.resolve_billing_customer_owner(text, text)
  OWNER TO app_billing_resolver_owner;--> statement-breakpoint
REVOKE app_billing_resolver_owner FROM CURRENT_USER;--> statement-breakpoint
REVOKE CREATE ON SCHEMA app FROM app_billing_resolver_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.resolve_billing_customer_owner(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.resolve_billing_customer_owner(text, text) TO app_billing_resolver;
