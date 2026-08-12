import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

const repositoryMigrations = resolve("drizzle");
const temporaryRoot = await mkdtemp(
  join(tmpdir(), "astroligyapp-previous-migrations-"),
);
const temporaryMeta = join(temporaryRoot, "meta");
const pool = new Pool({ connectionString: databaseUrl });

try {
  await mkdir(temporaryMeta);
  for (const name of [
    "0000_strong_mandroid.sql",
    "0001_private_row_security.sql",
  ]) {
    await writeFile(
      join(temporaryRoot, name),
      await readFile(join(repositoryMigrations, name)),
    );
  }
  const journal = JSON.parse(
    await readFile(join(repositoryMigrations, "meta", "_journal.json"), "utf8"),
  );
  journal.entries = journal.entries.filter((entry) => entry.idx < 2);
  await writeFile(
    join(temporaryMeta, "_journal.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
  );

  await migrate(drizzle(pool), { migrationsFolder: temporaryRoot });

  const legacy = await pool.query(
    `with account as (
       insert into user_account (identity_provider_subject)
       values ('migration-legacy-owner') returning id
     ), profile_row as (
       insert into profile (owner_user_id, display_name, current_timezone)
       select id, 'Legacy fixture', 'UTC' from account returning id
     ), first_birth as (
       insert into birth_profile
         (profile_id, birth_date, timezone, birth_time_precision)
       select id, '1990-01-01', 'UTC', 'date-only' from profile_row returning id
     ), second_birth as (
       insert into birth_profile
         (profile_id, birth_date, timezone, birth_time_precision)
       select id, '1991-02-02', 'UTC', 'date-only' from profile_row returning id
     )
     insert into compatibility_report
       (owner_user_id, primary_birth_profile_id, comparison_birth_profile_id,
        calculation_references, category_contributions)
     select account.id, first_birth.id, second_birth.id, '{}', '[]'
     from account, first_birth, second_birth
     returning id`,
  );
  const legacyId = legacy.rows[0].id;
  await pool.query(
    `update compatibility_report
     set share_token_hash = $2, share_expires_at = '2099-01-01T00:00:00Z'
     where id = $1`,
    [legacyId, `sha256:${"a".repeat(64)}`],
  );
  const malformedLegacy = await pool.query(
    `insert into compatibility_report
       (owner_user_id, primary_birth_profile_id, comparison_birth_profile_id,
        calculation_references, category_contributions,
        share_token_hash, share_expires_at)
     select owner_user_id, primary_birth_profile_id, comparison_birth_profile_id,
            '{}', '[]', 'legacy-unsafe-token', '2099-01-01T00:00:00Z'
     from compatibility_report where id = $1
     returning id`,
    [legacyId],
  );
  const malformedLegacyId = malformedLegacy.rows[0].id;
  const legacySubscription = await pool.query(
    `insert into subscription
       (user_account_id, plan_key, status, external_provider,
        external_customer_reference, external_subscription_reference,
        period_starts_at, period_ends_at, last_provider_event_id)
     select owner_user_id, 'legacy-plan', 'active', 'legacy-provider',
            'legacy-customer', 'legacy-subscription',
            '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', 'legacy-event'
     from compatibility_report where id = $1
     returning id`,
    [legacyId],
  );
  const legacySubscriptionId = legacySubscription.rows[0].id;

  await migrate(drizzle(pool), { migrationsFolder: repositoryMigrations });

  const upgraded = await pool.query(
    `select share_state, report_payload, report_version, public_share_payload,
            public_share_payload_digest, share_token_hash, share_revoked_at
     from compatibility_report where id = $1`,
    [legacyId],
  );
  const row = upgraded.rows[0];
  if (
    row?.share_state !== "private" ||
    row.report_payload !== null ||
    row.report_version !== null ||
    row.public_share_payload !== null ||
    row.public_share_payload_digest !== null ||
    row.share_token_hash !== `sha256:${"a".repeat(64)}` ||
    row.share_revoked_at === null
  )
    throw new Error("Legacy compatibility row was not upgraded safely");
  const cleared = await pool.query(
    `select share_token_hash, share_expires_at, share_revoked_at
     from compatibility_report where id = $1`,
    [malformedLegacyId],
  );
  if (
    cleared.rows[0]?.share_token_hash !== null ||
    cleared.rows[0]?.share_expires_at !== null ||
    cleared.rows[0]?.share_revoked_at !== null
  )
    throw new Error("Malformed legacy share state was not cleared safely");
  const upgradedSubscription = await pool.query(
    `select plan_key, last_provider_event_id, transition_state_version,
            last_provider_event_occurred_at
     from subscription where id = $1`,
    [legacySubscriptionId],
  );
  if (
    upgradedSubscription.rows[0]?.plan_key !== "legacy-plan" ||
    upgradedSubscription.rows[0]?.last_provider_event_id !== "legacy-event" ||
    upgradedSubscription.rows[0]?.transition_state_version !== null ||
    upgradedSubscription.rows[0]?.last_provider_event_occurred_at !== null
  )
    throw new Error(
      "Legacy subscription was not preserved as unverified state",
    );

  const overlap = await pool.query(
    `insert into compatibility_report
       (owner_user_id, primary_birth_profile_id, comparison_birth_profile_id,
        calculation_references, category_contributions)
     select owner_user_id, primary_birth_profile_id, comparison_birth_profile_id,
            '{}', '[]'
     from compatibility_report where id = $1
     returning share_state, report_payload`,
    [legacyId],
  );
  if (
    overlap.rows[0]?.share_state !== "private" ||
    overlap.rows[0]?.report_payload !== null
  )
    throw new Error("Previous application writes are not overlap-safe");
  const overlapSubscription = await pool.query(
    `insert into subscription
       (user_account_id, plan_key, status, external_provider,
        external_customer_reference, external_subscription_reference)
     select owner_user_id, 'legacy-plan', 'paused', 'legacy-provider',
            'overlap-customer', 'overlap-subscription'
     from compatibility_report where id = $1
     returning transition_state_version, last_provider_event_occurred_at`,
    [legacyId],
  );
  if (
    overlapSubscription.rows[0]?.transition_state_version !== null ||
    overlapSubscription.rows[0]?.last_provider_event_occurred_at !== null
  )
    throw new Error("Previous subscription writes are not overlap-safe");

  const boundary = await pool.query(
    `select
       has_function_privilege(
         'app_share_reader',
         'app.current_share_token_hash()',
         'EXECUTE'
       ) as can_execute,
       has_table_privilege(
         'app_share_reader',
         'compatibility_report',
         'SELECT'
       ) as can_select,
       has_column_privilege(
         'app_share_reader',
         'compatibility_report',
         'public_share_payload',
         'SELECT'
       ) as can_select_public,
       has_column_privilege(
         'app_share_reader',
         'compatibility_report',
         'report_payload',
         'SELECT'
       ) as can_select_private`,
  );
  if (
    boundary.rows[0]?.can_execute !== true ||
    boundary.rows[0]?.can_select !== false ||
    boundary.rows[0]?.can_select_public !== true ||
    boundary.rows[0]?.can_select_private !== false
  )
    throw new Error("Public share reader privileges are broader than intended");

  process.stdout.write(
    "Compatibility/subscription migration upgrade: legacy rows, overlap writes, and RLS-scoped column reader passed\n",
  );
} finally {
  await pool.end();
  await rm(temporaryRoot, { recursive: true, force: true });
}
