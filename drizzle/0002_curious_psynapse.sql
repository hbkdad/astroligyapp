CREATE TYPE "public"."compatibility_share_state" AS ENUM('private', 'public');--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD COLUMN "report_payload" json;--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD COLUMN "report_version" text;--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD COLUMN "share_state" "compatibility_share_state" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD COLUMN "public_share_payload" json;--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD COLUMN "public_share_version" text;--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD COLUMN "public_share_payload_digest" text;--> statement-breakpoint
UPDATE compatibility_report
SET share_expires_at = NULL,
    share_revoked_at = NULL,
    share_token_hash = NULL
WHERE (share_token_hash IS NULL
       AND (share_expires_at IS NOT NULL OR share_revoked_at IS NOT NULL))
   OR (share_token_hash IS NOT NULL
       AND share_token_hash !~ '^sha256:[0-9a-f]{64}$');--> statement-breakpoint
UPDATE compatibility_report
SET share_revoked_at = COALESCE(share_revoked_at, CURRENT_TIMESTAMP)
WHERE share_token_hash ~ '^sha256:[0-9a-f]{64}$';--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD CONSTRAINT "compatibility_report_payload_version_check" CHECK ((report_payload IS NULL) = (report_version IS NULL));--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD CONSTRAINT "compatibility_report_token_digest_check" CHECK (((share_token_hash IS NULL) OR (share_token_hash ~ '^sha256:[0-9a-f]{64}$')) AND ((public_share_payload_digest IS NULL) OR (public_share_payload_digest ~ '^sha256:[0-9a-f]{64}$')));--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD CONSTRAINT "compatibility_report_share_lifecycle_check" CHECK (((share_state = 'public' AND report_payload IS NOT NULL AND public_share_payload IS NOT NULL AND public_share_version IS NOT NULL AND public_share_payload_digest IS NOT NULL AND share_token_hash IS NOT NULL AND share_revoked_at IS NULL) OR (share_state = 'private' AND public_share_payload IS NULL AND public_share_version IS NULL AND public_share_payload_digest IS NULL AND ((share_token_hash IS NULL AND share_expires_at IS NULL AND share_revoked_at IS NULL) OR (share_token_hash IS NOT NULL AND share_revoked_at IS NOT NULL)))));--> statement-breakpoint
CREATE ROLE app_share_reader NOLOGIN;--> statement-breakpoint
GRANT app_share_reader TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA app, public TO app_share_reader;--> statement-breakpoint
CREATE FUNCTION app.current_share_token_hash() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN NULLIF(current_setting('app.current_share_token_hash', true), '')
      ~ '^sha256:[0-9a-f]{64}$'
    THEN NULLIF(current_setting('app.current_share_token_hash', true), '')
    ELSE NULL
  END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.current_share_token_hash() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_share_token_hash() TO app_share_reader;--> statement-breakpoint
GRANT SELECT (public_share_payload, public_share_payload_digest)
  ON compatibility_report TO app_share_reader;--> statement-breakpoint
CREATE POLICY "compatibility_report_public_share" ON "compatibility_report" AS PERMISSIVE FOR SELECT TO "app_share_reader" USING (((share_token_hash = app.current_share_token_hash()) AND (share_state = 'public') AND (share_revoked_at IS NULL) AND ((share_expires_at IS NULL) OR (share_expires_at > CURRENT_TIMESTAMP))));--> statement-breakpoint
ALTER POLICY "compatibility_report_owner" ON "compatibility_report" TO app_user USING (((owner_user_id = app.current_user_id()) AND (EXISTS ( SELECT 1
   FROM (birth_profile primary_birth
     JOIN profile primary_profile ON ((primary_profile.id = primary_birth.profile_id)))
  WHERE ((primary_birth.id = compatibility_report.primary_birth_profile_id) AND (primary_profile.owner_user_id = app.current_user_id())))) AND (EXISTS ( SELECT 1
   FROM (birth_profile comparison_birth
     JOIN profile comparison_profile ON ((comparison_profile.id = comparison_birth.profile_id)))
  WHERE ((comparison_birth.id = compatibility_report.comparison_birth_profile_id) AND (comparison_profile.owner_user_id = app.current_user_id())))))) WITH CHECK (((owner_user_id = app.current_user_id()) AND (EXISTS ( SELECT 1
   FROM (birth_profile primary_birth
     JOIN profile primary_profile ON ((primary_profile.id = primary_birth.profile_id)))
  WHERE ((primary_birth.id = compatibility_report.primary_birth_profile_id) AND (primary_profile.owner_user_id = app.current_user_id())))) AND (EXISTS ( SELECT 1
   FROM (birth_profile comparison_birth
     JOIN profile comparison_profile ON ((comparison_profile.id = comparison_birth.profile_id)))
  WHERE ((comparison_birth.id = compatibility_report.comparison_birth_profile_id) AND (comparison_profile.owner_user_id = app.current_user_id()))))));
