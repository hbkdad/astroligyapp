import "server-only";

import type { Pool, PoolClient } from "pg";

import type { AccountId } from "@/infrastructure/auth/account";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import { createEntitlementPolicy } from "@/server/entitlement-policy";
import {
  validatePrivateProfileCommand,
  validatePrivateProfileView,
  type PrivateProfileCommand,
  type PrivateProfileView,
} from "@/server/private-profile-contracts";

interface ProfileRow {
  profile_id: string;
  birth_profile_id: string;
  revision: number;
  display_name: string;
  current_timezone: string;
  birth_date: string;
  birth_time_precision: string;
  birth_time_local: string | null;
  birth_timezone: string;
  latitude: string | null;
  longitude: string | null;
}

interface SubscriptionRow {
  transition_state_version: string | null;
  plan_key: string;
  status: string;
  period_starts_at: Date | string | null;
  period_ends_at: Date | string | null;
}

export class PrivateProfileAuthorizationError extends Error {
  constructor() {
    super("Private profile operation is not authorized");
    this.name = "PrivateProfileAuthorizationError";
  }
}

export class PrivateProfileConflictError extends Error {
  constructor() {
    super("Private profile revision conflicts with current state");
    this.name = "PrivateProfileConflictError";
  }
}

export class PrivateProfileLimitError extends Error {
  constructor() {
    super("Private profile entitlement limit reached");
    this.name = "PrivateProfileLimitError";
  }
}

export class PrivateProfileRepository {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(ownerId: AccountId): Promise<
    Readonly<{
      profiles: readonly PrivateProfileView[];
      multipleProfilesAllowed: boolean;
    }>
  > {
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const profiles = await selectProfiles(client);
      return Object.freeze({
        profiles: Object.freeze(profiles),
        multipleProfilesAllowed: await allowsMultiple(client, this.now),
      });
    });
  }

  async mutate(
    ownerId: AccountId,
    commandValue: unknown,
  ): Promise<Readonly<{ outcome: "saved" | "deleted" }>> {
    const command = validatePrivateProfileCommand(commandValue, this.now());
    if (!command) throw new PrivateProfileAuthorizationError();
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      if (command.operation === "create")
        return create(client, ownerId, command, this.now);
      if (command.operation === "update") return update(client, command);
      return remove(client, command);
    });
  }
}

async function selectProfiles(
  client: PoolClient,
): Promise<PrivateProfileView[]> {
  const result = await client.query<ProfileRow>(
    `select p.id as profile_id,
            b.id as birth_profile_id,
            p.revision,
            p.display_name,
            p.current_timezone,
            b.birth_date::text,
            b.birth_time_precision,
            b.birth_time_local,
            b.timezone as birth_timezone,
            b.latitude::text,
            b.longitude::text
       from profile p
       join birth_profile b on b.profile_id = p.id
      where p.deleted_at is null
      order by p.created_at, b.created_at, b.id`,
  );
  return result.rows.map(projectRow);
}

async function create(
  client: PoolClient,
  ownerId: AccountId,
  command: Extract<PrivateProfileCommand, { operation: "create" }>,
  now: () => Date,
) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `private-profile:${ownerId}`,
  ]);
  const count = await client.query<{ count: string }>(
    "select count(*)::text as count from profile where deleted_at is null",
  );
  if (
    Number(count.rows[0]?.count ?? "0") >= 1 &&
    !(await allowsMultiple(client, now))
  )
    throw new PrivateProfileLimitError();
  const value = command.value;
  const profile = await client.query<{ id: string; revision: number }>(
    `insert into profile
       (owner_user_id, display_name, current_timezone, preferences)
     values ($1, $2, $3, '{}'::jsonb)
     returning id, revision`,
    [ownerId, value.displayName, value.currentTimezone],
  );
  const profileId = profile.rows[0]?.id;
  if (!profileId) throw new PrivateProfileAuthorizationError();
  await client.query(
    `insert into birth_profile
       (profile_id, birth_date, birth_time_local, timezone,
        timezone_resolution, latitude, longitude, coordinate_source,
        birth_time_precision, uncertainty)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb)`,
    birthParameters(profileId, value),
  );
  return Object.freeze({ outcome: "saved" as const });
}

async function update(
  client: PoolClient,
  command: Extract<PrivateProfileCommand, { operation: "update" }>,
) {
  const owned = await client.query<{ revision: number }>(
    `select p.revision
       from profile p
       join birth_profile b on b.profile_id = p.id
      where p.id = $1 and b.id = $2 and p.deleted_at is null
      for update of p, b`,
    [command.profileId, command.birthProfileId],
  );
  const current = owned.rows[0];
  if (!current) throw new PrivateProfileAuthorizationError();
  if (current.revision !== command.revision)
    throw new PrivateProfileConflictError();
  const value = command.value;
  await client.query(
    `update profile
        set display_name = $2,
            current_timezone = $3,
            revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP
      where id = $1`,
    [command.profileId, value.displayName, value.currentTimezone],
  );
  const birth = await client.query(
    `update birth_profile
        set birth_date = $3,
            birth_time_local = $4,
            timezone = $5,
            timezone_resolution = $6::jsonb,
            latitude = $7,
            longitude = $8,
            coordinate_source = $9,
            birth_time_precision = $10,
            uncertainty = $11::jsonb,
            updated_at = CURRENT_TIMESTAMP
      where profile_id = $1 and id = $2`,
    [command.profileId, command.birthProfileId, ...birthValues(value)],
  );
  if (birth.rowCount !== 1) throw new PrivateProfileAuthorizationError();
  return Object.freeze({ outcome: "saved" as const });
}

async function remove(
  client: PoolClient,
  command: Extract<PrivateProfileCommand, { operation: "delete" }>,
) {
  const owned = await client.query<{ revision: number }>(
    `select p.revision
       from profile p
       join birth_profile b on b.profile_id = p.id
      where p.id = $1 and b.id = $2 and p.deleted_at is null
      for update of p, b`,
    [command.profileId, command.birthProfileId],
  );
  const current = owned.rows[0];
  if (!current) throw new PrivateProfileAuthorizationError();
  if (current.revision !== command.revision)
    throw new PrivateProfileConflictError();
  const deleted = await client.query("delete from profile where id = $1", [
    command.profileId,
  ]);
  if (deleted.rowCount !== 1) throw new PrivateProfileAuthorizationError();
  return Object.freeze({ outcome: "deleted" as const });
}

async function allowsMultiple(client: PoolClient, now: () => Date) {
  const subscriptions = await client.query<SubscriptionRow>(
    `select transition_state_version, plan_key, status,
            period_starts_at, period_ends_at
       from subscription
      order by updated_at desc`,
  );
  const policy = createEntitlementPolicy();
  return subscriptions.rows.some(
    (row) =>
      policy.check(
        {
          version: row.transition_state_version,
          planKey: row.plan_key,
          status: row.status,
          periodStartsAt: instant(row.period_starts_at),
          periodEndsAt: instant(row.period_ends_at),
        },
        "multiple_profiles",
        { now },
      ).allowed,
  );
}

function projectRow(row: ProfileRow): PrivateProfileView {
  const value = validatePrivateProfileView({
    profileId: row.profile_id,
    birthProfileId: row.birth_profile_id,
    revision: row.revision,
    displayName: row.display_name,
    currentTimezone: row.current_timezone,
    birthDate: row.birth_date,
    birthTimePrecision: row.birth_time_precision,
    birthTimeLocal: row.birth_time_local,
    birthTimezone: row.birth_timezone,
    latitude: numeric(row.latitude),
    longitude: numeric(row.longitude),
  });
  if (!value) throw new PrivateProfileAuthorizationError();
  return value;
}

function birthParameters(
  profileId: string,
  value: Extract<PrivateProfileCommand, { operation: "create" }>["value"],
) {
  return [profileId, ...birthValues(value)];
}

function birthValues(
  value: Extract<PrivateProfileCommand, { operation: "create" }>["value"],
) {
  const hasCoordinates = value.latitude !== null;
  return [
    value.birthDate,
    value.birthTimeLocal,
    value.birthTimezone,
    JSON.stringify({ source: "user-supplied" }),
    value.latitude,
    value.longitude,
    hasCoordinates ? "user-supplied" : null,
    value.birthTimePrecision,
    JSON.stringify({
      time: value.birthTimePrecision,
      location: hasCoordinates ? "user-supplied" : "absent",
    }),
  ];
}

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new PrivateProfileAuthorizationError();
  return parsed;
}

function instant(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
