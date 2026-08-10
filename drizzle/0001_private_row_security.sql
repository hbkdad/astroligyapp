CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
CREATE ROLE app_user NOLOGIN;
--> statement-breakpoint
CREATE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.current_user_id() FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_user_id() TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint

ALTER TABLE user_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_account FORCE ROW LEVEL SECURITY;
CREATE POLICY user_account_owner ON user_account FOR ALL TO app_user
  USING (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile FORCE ROW LEVEL SECURITY;
CREATE POLICY profile_owner ON profile FOR ALL TO app_user
  USING (owner_user_id = app.current_user_id())
  WITH CHECK (owner_user_id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE calculation_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_run FORCE ROW LEVEL SECURITY;
CREATE POLICY calculation_run_owner ON calculation_run FOR ALL TO app_user
  USING (owner_user_id = app.current_user_id())
  WITH CHECK (owner_user_id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE compatibility_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE compatibility_report FORCE ROW LEVEL SECURITY;
CREATE POLICY compatibility_report_owner ON compatibility_report FOR ALL TO app_user
  USING (owner_user_id = app.current_user_id())
  WITH CHECK (owner_user_id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_owner ON subscription FOR ALL TO app_user
  USING (user_account_id = app.current_user_id())
  WITH CHECK (user_account_id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_event_owner ON audit_event FOR SELECT TO app_user
  USING (owner_user_id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE birth_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE birth_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY birth_profile_owner ON birth_profile FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = birth_profile.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = birth_profile.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE birth_chart ENABLE ROW LEVEL SECURITY;
ALTER TABLE birth_chart FORCE ROW LEVEL SECURITY;
CREATE POLICY birth_chart_owner ON birth_chart FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM birth_profile
    JOIN profile ON profile.id = birth_profile.profile_id
    WHERE birth_profile.id = birth_chart.birth_profile_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM birth_profile
    JOIN profile ON profile.id = birth_profile.profile_id
    WHERE birth_profile.id = birth_chart.birth_profile_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE planet_position ENABLE ROW LEVEL SECURITY;
ALTER TABLE planet_position FORCE ROW LEVEL SECURITY;
CREATE POLICY planet_position_owner ON planet_position FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM calculation_run
    WHERE calculation_run.id = planet_position.calculation_run_id
      AND calculation_run.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM calculation_run
    WHERE calculation_run.id = planet_position.calculation_run_id
      AND calculation_run.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE aspect ENABLE ROW LEVEL SECURITY;
ALTER TABLE aspect FORCE ROW LEVEL SECURITY;
CREATE POLICY aspect_owner ON aspect FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM calculation_run
    WHERE calculation_run.id = aspect.calculation_run_id
      AND calculation_run.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM calculation_run
    WHERE calculation_run.id = aspect.calculation_run_id
      AND calculation_run.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE lunar_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE lunar_event FORCE ROW LEVEL SECURITY;
CREATE POLICY lunar_event_owner ON lunar_event FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM calculation_run
    WHERE calculation_run.id = lunar_event.calculation_run_id
      AND calculation_run.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM calculation_run
    WHERE calculation_run.id = lunar_event.calculation_run_id
      AND calculation_run.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE house_cusp ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_cusp FORCE ROW LEVEL SECURITY;
CREATE POLICY house_cusp_owner ON house_cusp FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM birth_chart
    JOIN birth_profile ON birth_profile.id = birth_chart.birth_profile_id
    JOIN profile ON profile.id = birth_profile.profile_id
    WHERE birth_chart.id = house_cusp.birth_chart_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM birth_chart
    JOIN birth_profile ON birth_profile.id = birth_chart.birth_profile_id
    JOIN profile ON profile.id = birth_profile.profile_id
    WHERE birth_chart.id = house_cusp.birth_chart_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE transit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE transit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY transit_event_owner ON transit_event FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = transit_event.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ) AND EXISTS (
    SELECT 1 FROM calculation_run
    WHERE calculation_run.id = transit_event.calculation_run_id
      AND calculation_run.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = transit_event.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ) AND EXISTS (
    SELECT 1 FROM calculation_run
    WHERE calculation_run.id = transit_event.calculation_run_id
      AND calculation_run.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE numerology_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE numerology_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY numerology_profile_owner ON numerology_profile FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = numerology_profile.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = numerology_profile.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE numerology_cycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE numerology_cycle FORCE ROW LEVEL SECURITY;
CREATE POLICY numerology_cycle_owner ON numerology_cycle FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM numerology_profile
    JOIN profile ON profile.id = numerology_profile.profile_id
    WHERE numerology_profile.id = numerology_cycle.numerology_profile_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM numerology_profile
    JOIN profile ON profile.id = numerology_profile.profile_id
    WHERE numerology_profile.id = numerology_cycle.numerology_profile_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE daily_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_context FORCE ROW LEVEL SECURITY;
CREATE POLICY daily_context_owner ON daily_context FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = daily_context.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = daily_context.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE daily_reading ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reading FORCE ROW LEVEL SECURITY;
CREATE POLICY daily_reading_owner ON daily_reading FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM daily_context
    JOIN profile ON profile.id = daily_context.profile_id
    WHERE daily_context.id = daily_reading.daily_context_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM daily_context
    JOIN profile ON profile.id = daily_context.profile_id
    WHERE daily_context.id = daily_reading.daily_context_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE notification_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preference FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_preference_owner ON notification_preference FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = notification_preference.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profile
    WHERE profile.id = notification_preference.profile_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

ALTER TABLE notification_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_delivery_owner ON notification_delivery FOR ALL TO app_user
  USING (EXISTS (
    SELECT 1 FROM notification_preference
    JOIN profile ON profile.id = notification_preference.profile_id
    WHERE notification_preference.id = notification_delivery.preference_id
      AND profile.owner_user_id = app.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM notification_preference
    JOIN profile ON profile.id = notification_preference.profile_id
    WHERE notification_preference.id = notification_delivery.preference_id
      AND profile.owner_user_id = app.current_user_id()
  ));
--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON content_interpretation FROM app_user;
