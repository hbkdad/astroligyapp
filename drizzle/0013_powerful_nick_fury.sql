ALTER TABLE "birth_chart" DROP CONSTRAINT "birth_chart_calculation_run_id_calculation_run_id_fk";
--> statement-breakpoint
DROP INDEX "calculation_run_cache_uidx";--> statement-breakpoint
ALTER TABLE "birth_chart" ADD CONSTRAINT "birth_chart_calculation_run_id_calculation_run_id_fk" FOREIGN KEY ("calculation_run_id") REFERENCES "public"."calculation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_run_cache_uidx" ON "calculation_run" USING btree ("kind" text_ops,"normalized_input_hash" text_ops,"engine_version" text_ops,"provider_key" text_ops,"provider_version" text_ops,"config_version" text_ops,"owner_user_id" uuid_ops);