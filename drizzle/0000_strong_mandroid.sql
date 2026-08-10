CREATE TYPE "public"."calculation_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'paused', 'canceled');--> statement-breakpoint
CREATE TABLE "aspect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_run_id" uuid NOT NULL,
	"source_body" text NOT NULL,
	"target_body" text NOT NULL,
	"aspect_type" text NOT NULL,
	"exact_angle" numeric(9, 6) NOT NULL,
	"actual_angle" numeric(9, 6) NOT NULL,
	"orb" numeric(9, 6) NOT NULL,
	"phase" text NOT NULL,
	"strength" numeric(8, 6) NOT NULL,
	CONSTRAINT "aspect_orb_check" CHECK ("aspect"."orb" >= 0),
	CONSTRAINT "aspect_strength_check" CHECK ("aspect"."strength" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"actor_reference" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_reference" text NOT NULL,
	"action" text NOT NULL,
	"request_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "birth_chart" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"birth_profile_id" uuid NOT NULL,
	"calculation_run_id" uuid NOT NULL,
	"house_system" text NOT NULL,
	"resolution_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "birth_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"birth_date" date NOT NULL,
	"birth_time_local" text,
	"timezone" text NOT NULL,
	"timezone_resolution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"coordinate_source" text,
	"birth_time_precision" text NOT NULL,
	"uncertainty" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "birth_profile_latitude_check" CHECK ("birth_profile"."latitude" is null or "birth_profile"."latitude" between -90 and 90),
	CONSTRAINT "birth_profile_longitude_check" CHECK ("birth_profile"."longitude" is null or "birth_profile"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "calculation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"normalized_input_hash" text NOT NULL,
	"engine_version" text NOT NULL,
	"provider_key" text NOT NULL,
	"provider_version" text NOT NULL,
	"config_version" text NOT NULL,
	"status" "calculation_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_code" text
);
--> statement-breakpoint
CREATE TABLE "compatibility_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"primary_birth_profile_id" uuid NOT NULL,
	"comparison_birth_profile_id" uuid NOT NULL,
	"calculation_references" jsonb NOT NULL,
	"category_contributions" jsonb NOT NULL,
	"share_token_hash" text,
	"share_expires_at" timestamp with time zone,
	"share_revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compatibility_report_distinct_profiles_check" CHECK ("compatibility_report"."primary_birth_profile_id" <> "compatibility_report"."comparison_birth_profile_id")
);
--> statement-breakpoint
CREATE TABLE "content_interpretation" (
	"interpretation_key" text NOT NULL,
	"locale" text NOT NULL,
	"content_version" integer NOT NULL,
	"fact_requirements" jsonb NOT NULL,
	"fallback_template" text NOT NULL,
	"state" "publication_state" DEFAULT 'draft' NOT NULL,
	"review_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_interpretation_interpretation_key_locale_content_version_pk" PRIMARY KEY("interpretation_key","locale","content_version")
);
--> statement-breakpoint
CREATE TABLE "daily_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"timezone" text NOT NULL,
	"source_references" jsonb NOT NULL,
	"score_model_version" text NOT NULL,
	"category_scores" jsonb NOT NULL,
	"contributing_signals" jsonb NOT NULL,
	"cache_input_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reading" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_context_id" uuid NOT NULL,
	"interpretation_library_version" text NOT NULL,
	"ai_model_version" text,
	"ai_prompt_version" text,
	"output_schema_version" text NOT NULL,
	"validated_output" jsonb NOT NULL,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "house_cusp" (
	"birth_chart_id" uuid NOT NULL,
	"house_number" integer NOT NULL,
	"longitude" numeric(12, 8) NOT NULL,
	"house_system" text NOT NULL,
	CONSTRAINT "house_cusp_birth_chart_id_house_number_pk" PRIMARY KEY("birth_chart_id","house_number"),
	CONSTRAINT "house_cusp_number_check" CHECK ("house_cusp"."house_number" between 1 and 12),
	CONSTRAINT "house_cusp_longitude_check" CHECK ("house_cusp"."longitude" >= 0 and "house_cusp"."longitude" < 360)
);
--> statement-breakpoint
CREATE TABLE "lunar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_run_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"starts_at" timestamp with time zone,
	"exact_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location_scope" jsonb,
	"phase_angle" numeric(12, 8),
	"illumination" numeric(8, 6),
	"moon_longitude" numeric(12, 8),
	CONSTRAINT "lunar_event_illumination_check" CHECK ("lunar_event"."illumination" is null or "lunar_event"."illumination" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preference_id" uuid NOT NULL,
	"event_reference" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_code" text
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"event_type" text NOT NULL,
	"opted_in" boolean DEFAULT false NOT NULL,
	"timezone" text NOT NULL,
	"frequency" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "numerology_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numerology_profile_id" uuid NOT NULL,
	"cycle_type" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	"value" integer NOT NULL,
	"calculation_trace" jsonb NOT NULL,
	CONSTRAINT "numerology_cycle_range_check" CHECK ("numerology_cycle"."effective_from" <= "numerology_cycle"."effective_to")
);
--> statement-breakpoint
CREATE TABLE "numerology_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"normalized_input_hash" text NOT NULL,
	"strategy_version" text NOT NULL,
	"normalization_version" text NOT NULL,
	"results" jsonb NOT NULL,
	"calculation_trace" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planet_position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_run_id" uuid NOT NULL,
	"body" text NOT NULL,
	"longitude" numeric(12, 8) NOT NULL,
	"latitude" numeric(12, 8),
	"distance" numeric(18, 10),
	"speed" numeric(18, 10),
	"coordinate_frame" text NOT NULL,
	"units" jsonb NOT NULL,
	CONSTRAINT "planet_position_longitude_check" CHECK ("planet_position"."longitude" >= 0 and "planet_position"."longitude" < 360)
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"current_timezone" text NOT NULL,
	"current_latitude" numeric(9, 6),
	"current_longitude" numeric(9, 6),
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "profile_current_latitude_check" CHECK ("profile"."current_latitude" is null or "profile"."current_latitude" between -90 and 90),
	CONSTRAINT "profile_current_longitude_check" CHECK ("profile"."current_longitude" is null or "profile"."current_longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_account_id" uuid NOT NULL,
	"plan_key" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"external_provider" text NOT NULL,
	"external_customer_reference" text NOT NULL,
	"external_subscription_reference" text NOT NULL,
	"period_starts_at" timestamp with time zone,
	"period_ends_at" timestamp with time zone,
	"last_provider_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"calculation_run_id" uuid NOT NULL,
	"transiting_body" text NOT NULL,
	"natal_target" text NOT NULL,
	"aspect_type" text NOT NULL,
	"enters_orb_at" timestamp with time zone,
	"exact_at" timestamp with time zone NOT NULL,
	"exits_orb_at" timestamp with time zone,
	"score_model_version" text NOT NULL,
	"strength" numeric(8, 6) NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "transit_event_time_order_check" CHECK (("transit_event"."enters_orb_at" is null or "transit_event"."enters_orb_at" <= "transit_event"."exact_at") and ("transit_event"."exits_orb_at" is null or "transit_event"."exits_orb_at" >= "transit_event"."exact_at"))
);
--> statement-breakpoint
CREATE TABLE "user_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_provider_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "aspect" ADD CONSTRAINT "aspect_calculation_run_id_calculation_run_id_fk" FOREIGN KEY ("calculation_run_id") REFERENCES "public"."calculation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_owner_user_id_user_account_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "birth_chart" ADD CONSTRAINT "birth_chart_birth_profile_id_birth_profile_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "birth_chart" ADD CONSTRAINT "birth_chart_calculation_run_id_calculation_run_id_fk" FOREIGN KEY ("calculation_run_id") REFERENCES "public"."calculation_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "birth_chart" ADD CONSTRAINT "birth_chart_superseded_by_id_birth_chart_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."birth_chart"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "birth_profile" ADD CONSTRAINT "birth_profile_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_run" ADD CONSTRAINT "calculation_run_owner_user_id_user_account_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD CONSTRAINT "compatibility_report_owner_user_id_user_account_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD CONSTRAINT "compatibility_report_primary_birth_profile_id_birth_profile_id_fk" FOREIGN KEY ("primary_birth_profile_id") REFERENCES "public"."birth_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_report" ADD CONSTRAINT "compatibility_report_comparison_birth_profile_id_birth_profile_id_fk" FOREIGN KEY ("comparison_birth_profile_id") REFERENCES "public"."birth_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_context" ADD CONSTRAINT "daily_context_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reading" ADD CONSTRAINT "daily_reading_daily_context_id_daily_context_id_fk" FOREIGN KEY ("daily_context_id") REFERENCES "public"."daily_context"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_cusp" ADD CONSTRAINT "house_cusp_birth_chart_id_birth_chart_id_fk" FOREIGN KEY ("birth_chart_id") REFERENCES "public"."birth_chart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lunar_event" ADD CONSTRAINT "lunar_event_calculation_run_id_calculation_run_id_fk" FOREIGN KEY ("calculation_run_id") REFERENCES "public"."calculation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_preference_id_notification_preference_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."notification_preference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numerology_cycle" ADD CONSTRAINT "numerology_cycle_numerology_profile_id_numerology_profile_id_fk" FOREIGN KEY ("numerology_profile_id") REFERENCES "public"."numerology_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numerology_profile" ADD CONSTRAINT "numerology_profile_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planet_position" ADD CONSTRAINT "planet_position_calculation_run_id_calculation_run_id_fk" FOREIGN KEY ("calculation_run_id") REFERENCES "public"."calculation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_owner_user_id_user_account_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_account_id_user_account_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_event" ADD CONSTRAINT "transit_event_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_event" ADD CONSTRAINT "transit_event_calculation_run_id_calculation_run_id_fk" FOREIGN KEY ("calculation_run_id") REFERENCES "public"."calculation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aspect_calculation_run_idx" ON "aspect" USING btree ("calculation_run_id");--> statement-breakpoint
CREATE INDEX "audit_event_owner_occurred_idx" ON "audit_event" USING btree ("owner_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "birth_chart_birth_profile_idx" ON "birth_chart" USING btree ("birth_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "birth_chart_calculation_run_uidx" ON "birth_chart" USING btree ("calculation_run_id");--> statement-breakpoint
CREATE INDEX "birth_profile_profile_idx" ON "birth_profile" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "calculation_run_owner_idx" ON "calculation_run" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_run_cache_uidx" ON "calculation_run" USING btree ("kind","normalized_input_hash","engine_version","provider_key","provider_version","config_version");--> statement-breakpoint
CREATE INDEX "compatibility_report_owner_idx" ON "compatibility_report" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compatibility_report_share_token_uidx" ON "compatibility_report" USING btree ("share_token_hash") WHERE "compatibility_report"."share_token_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_context_profile_date_version_uidx" ON "daily_context" USING btree ("profile_id","local_date","score_model_version","cache_input_hash");--> statement-breakpoint
CREATE INDEX "daily_reading_context_idx" ON "daily_reading" USING btree ("daily_context_id");--> statement-breakpoint
CREATE INDEX "lunar_event_run_exact_idx" ON "lunar_event" USING btree ("calculation_run_id","exact_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_idempotency_uidx" ON "notification_delivery" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_delivery_preference_idx" ON "notification_delivery" USING btree ("preference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_profile_channel_event_uidx" ON "notification_preference" USING btree ("profile_id","channel","event_type");--> statement-breakpoint
CREATE INDEX "numerology_cycle_profile_range_idx" ON "numerology_cycle" USING btree ("numerology_profile_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "numerology_profile_profile_idx" ON "numerology_profile" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "numerology_profile_version_uidx" ON "numerology_profile" USING btree ("profile_id","normalized_input_hash","strategy_version","normalization_version");--> statement-breakpoint
CREATE UNIQUE INDEX "planet_position_run_body_uidx" ON "planet_position" USING btree ("calculation_run_id","body");--> statement-breakpoint
CREATE INDEX "profile_owner_idx" ON "profile" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "subscription_user_idx" ON "subscription" USING btree ("user_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_provider_reference_uidx" ON "subscription" USING btree ("external_provider","external_subscription_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_provider_event_uidx" ON "subscription" USING btree ("external_provider","last_provider_event_id") WHERE "subscription"."last_provider_event_id" is not null;--> statement-breakpoint
CREATE INDEX "transit_event_profile_exact_idx" ON "transit_event" USING btree ("profile_id","exact_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_account_identity_subject_uidx" ON "user_account" USING btree ("identity_provider_subject");