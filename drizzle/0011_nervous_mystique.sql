CREATE ROLE app_account_deletion NOLOGIN;--> statement-breakpoint
CREATE ROLE app_account_deletion_owner NOLOGIN NOINHERIT;--> statement-breakpoint
GRANT app_account_deletion TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_account_deletion;--> statement-breakpoint
GRANT USAGE ON SCHEMA auth, public TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (id, identity_provider_subject, deleted_at), UPDATE (deleted_at, updated_at)
  ON public.user_account TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (owner_user_id), DELETE ON public.profile TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (owner_user_id), DELETE ON public.calculation_run TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (owner_user_id), DELETE ON public.audit_event TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (user_account_id) ON public.subscription TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (user_account_id) ON public.billing_customer_binding TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (id, email, email_verified), DELETE ON auth."user" TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (id, user_id, created_at, expires_at) ON auth."session" TO app_account_deletion_owner;--> statement-breakpoint
GRANT SELECT (identifier, value), DELETE ON auth."verification" TO app_account_deletion_owner;--> statement-breakpoint
CREATE POLICY "audit_event_deletion_owner" ON "audit_event" AS PERMISSIVE FOR ALL TO "app_account_deletion_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "billing_customer_binding_deletion_owner" ON "billing_customer_binding" AS PERMISSIVE FOR SELECT TO "app_account_deletion_owner" USING (true);--> statement-breakpoint
CREATE POLICY "calculation_run_deletion_owner" ON "calculation_run" AS PERMISSIVE FOR ALL TO "app_account_deletion_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "profile_deletion_owner" ON "profile" AS PERMISSIVE FOR ALL TO "app_account_deletion_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "subscription_deletion_owner" ON "subscription" AS PERMISSIVE FOR SELECT TO "app_account_deletion_owner" USING (true);--> statement-breakpoint
CREATE POLICY "user_account_deletion_owner" ON "user_account" AS PERMISSIVE FOR ALL TO "app_account_deletion_owner" USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA app TO app_account_deletion_owner;--> statement-breakpoint
CREATE FUNCTION app.erase_local_auth_account(
  requested_subject text,
  requested_session text,
  requested_owner uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  account_deleted_at timestamptz;
  verified_email text;
  external_reconciliation boolean;
BEGIN
  IF char_length(requested_subject) NOT BETWEEN 1 AND 512
     OR char_length(requested_session) NOT BETWEEN 1 AND 512 THEN
    RETURN 'unavailable';
  END IF;

  SELECT account.deleted_at
    INTO account_deleted_at
    FROM public.user_account AS account
   WHERE account.id = requested_owner
     AND account.identity_provider_subject = requested_subject
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'unavailable';
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM public.subscription
            WHERE user_account_id = requested_owner
         ) OR EXISTS (
           SELECT 1 FROM public.billing_customer_binding
            WHERE user_account_id = requested_owner
         )
    INTO external_reconciliation;

  IF account_deleted_at IS NOT NULL THEN
    RETURN CASE WHEN external_reconciliation
      THEN 'reconciliation-required' ELSE 'deleted' END;
  END IF;

  SELECT auth_user.email
    INTO verified_email
    FROM auth."user" AS auth_user
    JOIN auth."session" AS auth_session
      ON auth_session.user_id = auth_user.id
   WHERE auth_user.id = requested_subject
     AND auth_user.email_verified = true
     AND auth_session.id = requested_session
     AND auth_session.expires_at > CURRENT_TIMESTAMP
     AND auth_session.created_at >= CURRENT_TIMESTAMP - interval '10 minutes';
  IF NOT FOUND THEN
    RETURN 'unavailable';
  END IF;

  DELETE FROM public.audit_event WHERE owner_user_id = requested_owner;
  DELETE FROM public.profile WHERE owner_user_id = requested_owner;
  DELETE FROM public.calculation_run WHERE owner_user_id = requested_owner;
  IF EXISTS (SELECT 1 FROM public.profile WHERE owner_user_id = requested_owner)
     OR EXISTS (SELECT 1 FROM public.calculation_run WHERE owner_user_id = requested_owner)
     OR EXISTS (SELECT 1 FROM public.audit_event WHERE owner_user_id = requested_owner) THEN
    RAISE EXCEPTION 'local account erasure invariant failed';
  END IF;
  UPDATE public.user_account
     SET deleted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = requested_owner AND deleted_at IS NULL;
  DELETE FROM auth.verification
   WHERE identifier IN (verified_email, requested_subject)
      OR value = requested_subject;
  DELETE FROM auth."user" WHERE id = requested_subject;

  RETURN CASE WHEN external_reconciliation
    THEN 'reconciliation-required' ELSE 'deleted' END;
END
$function$;--> statement-breakpoint
GRANT app_account_deletion_owner TO CURRENT_USER;--> statement-breakpoint
ALTER FUNCTION app.erase_local_auth_account(text, text, uuid)
  OWNER TO app_account_deletion_owner;--> statement-breakpoint
REVOKE app_account_deletion_owner FROM CURRENT_USER;--> statement-breakpoint
REVOKE CREATE ON SCHEMA app FROM app_account_deletion_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.erase_local_auth_account(text, text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.erase_local_auth_account(text, text, uuid)
  TO app_account_deletion;
