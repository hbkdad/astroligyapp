CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_account_provider_account_uidx" ON "auth"."account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_session_token_uidx" ON "auth"."session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_email_uidx" ON "auth"."user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth"."verification" USING btree ("identifier");
--> statement-breakpoint
REVOKE ALL ON SCHEMA auth FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM PUBLIC;--> statement-breakpoint
CREATE ROLE app_auth_runtime NOLOGIN;--> statement-breakpoint
CREATE ROLE app_auth_account_resolver NOLOGIN;--> statement-breakpoint
CREATE ROLE app_auth_account_owner NOLOGIN NOINHERIT;--> statement-breakpoint
CREATE ROLE app_auth_contact_resolver NOLOGIN;--> statement-breakpoint
CREATE ROLE app_auth_contact_owner NOLOGIN NOINHERIT;--> statement-breakpoint
GRANT app_auth_runtime TO CURRENT_USER;--> statement-breakpoint
GRANT app_auth_account_resolver TO CURRENT_USER;--> statement-breakpoint
GRANT app_auth_contact_resolver TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA auth TO app_auth_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO app_auth_runtime;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_auth_account_resolver;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_auth_account_owner;--> statement-breakpoint
GRANT SELECT (id, identity_provider_subject, deleted_at)
  ON public.user_account TO app_auth_account_owner;--> statement-breakpoint
CREATE POLICY "user_account_auth_account_owner"
  ON public.user_account FOR SELECT TO app_auth_account_owner
  USING (true);--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA app TO app_auth_account_owner;--> statement-breakpoint
CREATE FUNCTION app.resolve_active_auth_account(requested_subject text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT account.id
  FROM public.user_account AS account
  WHERE char_length(requested_subject) BETWEEN 1 AND 512
    AND account.identity_provider_subject = requested_subject
    AND account.deleted_at IS NULL
$function$;--> statement-breakpoint
GRANT app_auth_account_owner TO CURRENT_USER;--> statement-breakpoint
ALTER FUNCTION app.resolve_active_auth_account(text)
  OWNER TO app_auth_account_owner;--> statement-breakpoint
REVOKE app_auth_account_owner FROM CURRENT_USER;--> statement-breakpoint
REVOKE CREATE ON SCHEMA app FROM app_auth_account_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.resolve_active_auth_account(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.resolve_active_auth_account(text)
  TO app_auth_account_resolver;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_auth_contact_resolver;--> statement-breakpoint
GRANT USAGE ON SCHEMA auth, public TO app_auth_contact_owner;--> statement-breakpoint
GRANT SELECT (id, email, email_verified)
  ON auth."user" TO app_auth_contact_owner;--> statement-breakpoint
GRANT SELECT (id, user_id, created_at, expires_at)
  ON auth."session" TO app_auth_contact_owner;--> statement-breakpoint
GRANT SELECT (id, identity_provider_subject, deleted_at)
  ON public.user_account TO app_auth_contact_owner;--> statement-breakpoint
CREATE POLICY "user_account_auth_contact_owner"
  ON public.user_account FOR SELECT TO app_auth_contact_owner
  USING (true);--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA app TO app_auth_contact_owner;--> statement-breakpoint
CREATE FUNCTION app.resolve_verified_auth_contact(
  requested_subject text,
  requested_session_id text,
  requested_owner_id uuid
) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT lower(btrim(auth_user.email))
  FROM auth."session" AS auth_session
  JOIN auth."user" AS auth_user
    ON auth_user.id = auth_session.user_id
  JOIN public.user_account AS app_user
    ON app_user.identity_provider_subject = auth_user.id
  WHERE char_length(requested_subject) BETWEEN 1 AND 512
    AND char_length(requested_session_id) BETWEEN 1 AND 512
    AND auth_session.id = requested_session_id
    AND auth_session.user_id = requested_subject
    AND auth_session.expires_at > CURRENT_TIMESTAMP
    AND auth_session.created_at >= CURRENT_TIMESTAMP - INTERVAL '10 minutes'
    AND auth_user.email_verified
    AND char_length(auth_user.email) <= 254
    AND auth_user.email = btrim(auth_user.email)
    AND auth_user.email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
    AND app_user.id = requested_owner_id
    AND app_user.deleted_at IS NULL
$function$;--> statement-breakpoint
GRANT app_auth_contact_owner TO CURRENT_USER;--> statement-breakpoint
ALTER FUNCTION app.resolve_verified_auth_contact(text, text, uuid)
  OWNER TO app_auth_contact_owner;--> statement-breakpoint
REVOKE app_auth_contact_owner FROM CURRENT_USER;--> statement-breakpoint
REVOKE CREATE ON SCHEMA app FROM app_auth_contact_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.resolve_verified_auth_contact(text, text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.resolve_verified_auth_contact(text, text, uuid)
  TO app_auth_contact_resolver;
