ALTER TABLE "profile" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "birth_profile" ADD CONSTRAINT "birth_profile_timezone_length_check" CHECK (char_length(timezone) between 1 and 128);--> statement-breakpoint
ALTER TABLE "birth_profile" ADD CONSTRAINT "birth_profile_time_precision_check" CHECK (birth_time_precision in ('date-only', 'approximate', 'exact'));--> statement-breakpoint
ALTER TABLE "birth_profile" ADD CONSTRAINT "birth_profile_time_consistency_check" CHECK ((birth_time_precision = 'date-only' and birth_time_local is null) or (birth_time_precision in ('approximate', 'exact') and birth_time_local ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'));--> statement-breakpoint
ALTER TABLE "birth_profile" ADD CONSTRAINT "birth_profile_coordinates_pair_check" CHECK ((latitude is null) = (longitude is null));--> statement-breakpoint
ALTER TABLE "birth_profile" ADD CONSTRAINT "birth_profile_coordinate_source_check" CHECK ((latitude is null and coordinate_source is null) or (latitude is not null and char_length(coordinate_source) between 1 and 64));--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_display_name_length_check" CHECK (char_length(display_name) between 1 and 80);--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_current_timezone_length_check" CHECK (char_length(current_timezone) between 1 and 128);--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_current_coordinates_pair_check" CHECK ((current_latitude is null) = (current_longitude is null));--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_revision_check" CHECK (revision >= 1);