CREATE ROLE app_auth_account_bootstrap NOLOGIN;--> statement-breakpoint
CREATE ROLE app_auth_account_bootstrap_owner NOLOGIN NOINHERIT;--> statement-breakpoint
GRANT app_auth_account_bootstrap TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_auth_account_bootstrap;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_auth_account_bootstrap_owner;--> statement-breakpoint
GRANT SELECT (id, identity_provider_subject, deleted_at),
      INSERT (identity_provider_subject), UPDATE (updated_at)
  ON public.user_account TO app_auth_account_bootstrap_owner;--> statement-breakpoint
CREATE POLICY "user_account_auth_account_bootstrap_owner" ON "user_account" AS PERMISSIVE FOR ALL TO "app_auth_account_bootstrap_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA app TO app_auth_account_bootstrap_owner;--> statement-breakpoint
CREATE FUNCTION app.bootstrap_auth_account(requested_subject text)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  INSERT INTO public.user_account (identity_provider_subject)
  SELECT requested_subject
  WHERE char_length(requested_subject) BETWEEN 1 AND 512
  ON CONFLICT (identity_provider_subject) DO UPDATE
    SET updated_at = CURRENT_TIMESTAMP
    WHERE public.user_account.deleted_at IS NULL
  RETURNING id
$function$;--> statement-breakpoint
GRANT app_auth_account_bootstrap_owner TO CURRENT_USER;--> statement-breakpoint
ALTER FUNCTION app.bootstrap_auth_account(text)
  OWNER TO app_auth_account_bootstrap_owner;--> statement-breakpoint
REVOKE app_auth_account_bootstrap_owner FROM CURRENT_USER;--> statement-breakpoint
REVOKE CREATE ON SCHEMA app FROM app_auth_account_bootstrap_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.bootstrap_auth_account(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.bootstrap_auth_account(text)
  TO app_auth_account_bootstrap;
