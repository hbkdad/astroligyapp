import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AccountUnavailableError,
  bootstrapAccount,
  resolveActiveAccountId,
} from "@/infrastructure/auth/account";
import type { ActiveSession } from "@/infrastructure/auth/session";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for database integration tests",
  );
}

const pool = new Pool({ connectionString });
const ownerA = randomUUID();
const ownerB = randomUUID();
let profileA: string;
let profileB: string;
let birthProfileA: string;
let calculationRunA: string;

function activeSession(subject: string): ActiveSession {
  return {
    status: "active",
    subject,
    sessionId: `session-${subject}`,
    authenticatedAt: new Date("2026-08-09T11:00:00.000Z"),
    expiresAt: new Date("2026-08-09T13:00:00.000Z"),
  };
}

async function asUser<T>(
  userId: string | null,
  work: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role app_user");
    if (userId) {
      await client.query("select set_config('app.current_user_id', $1, true)", [
        userId,
      ]);
    }
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  await pool.query(
    `insert into user_account (id, identity_provider_subject)
     values ($1, 'test-owner-a'), ($2, 'test-owner-b')`,
    [ownerA, ownerB],
  );
  const profiles = await pool.query<{ id: string; owner_user_id: string }>(
    `insert into profile (owner_user_id, display_name, current_timezone)
     values ($1, 'Fixture A', 'America/Toronto'),
            ($2, 'Fixture B', 'America/Toronto')
     returning id, owner_user_id`,
    [ownerA, ownerB],
  );
  profileA = profiles.rows.find((row) => row.owner_user_id === ownerA)!.id;
  profileB = profiles.rows.find((row) => row.owner_user_id === ownerB)!.id;

  const birth = await pool.query<{ id: string }>(
    `insert into birth_profile
       (profile_id, birth_date, timezone, birth_time_precision)
     values ($1, '2000-01-01', 'America/Toronto', 'date-only') returning id`,
    [profileA],
  );
  birthProfileA = birth.rows[0]!.id;

  const run = await pool.query<{ id: string }>(
    `insert into calculation_run
       (owner_user_id, kind, normalized_input_hash, engine_version,
        provider_key, provider_version, config_version, status)
     values ($1, 'natal', 'fixture-hash-a', '1', 'fixture', '1', '1', 'completed')
     returning id`,
    [ownerA],
  );
  calculationRunA = run.rows[0]!.id;
  await pool.query(
    `insert into planet_position
       (calculation_run_id, body, longitude, coordinate_frame, units)
     values ($1, 'sun', 280.5, 'ecliptic-geocentric', '{"longitude":"degree"}')`,
    [calculationRunA],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("initial PostgreSQL migration", () => {
  it("creates the complete normalized model and private RLS policies", async () => {
    const tables = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
         and table_name <> '__drizzle_migrations'`,
    );
    const forcedPolicies = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity`,
    );
    expect(Number(tables.rows[0]!.count)).toBe(20);
    expect(Number(forcedPolicies.rows[0]!.count)).toBe(19);
  });

  it("enforces deterministic constraints and versioned cache uniqueness", async () => {
    await expect(
      pool.query(
        `insert into planet_position
           (calculation_run_id, body, longitude, coordinate_frame, units)
         values ($1, 'moon', 360, 'ecliptic-geocentric', '{}')`,
        [calculationRunA],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      pool.query(
        `insert into calculation_run
           (owner_user_id, kind, normalized_input_hash, engine_version,
            provider_key, provider_version, config_version)
         values ($1, 'natal', 'fixture-hash-a', '1', 'fixture', '1', '1')`,
        [ownerA],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("has indexes for the primary owner and event access paths", async () => {
    const indexes = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = new Set(indexes.rows.map((row) => row.indexname));
    expect(names).toContain("profile_owner_idx");
    expect(names).toContain("calculation_run_owner_idx");
    expect(names).toContain("transit_event_profile_exact_idx");
    expect(names).toContain("audit_event_owner_occurred_idx");
  });
});

describe("two-owner row isolation", () => {
  it("fails closed without a request identity", async () => {
    const result = await asUser(null, (client) =>
      client.query("select id from profile"),
    );
    expect(result.rowCount).toBe(0);
  });

  it("shows each owner only their own direct and derived rows", async () => {
    const a = await asUser(ownerA, async (client) => ({
      profiles: await client.query<{ id: string }>("select id from profile"),
      births: await client.query<{ id: string }>(
        "select id from birth_profile",
      ),
      positions: await client.query<{ body: string }>(
        "select body from planet_position",
      ),
    }));
    const b = await asUser(ownerB, async (client) => ({
      profiles: await client.query<{ id: string }>("select id from profile"),
      births: await client.query<{ id: string }>(
        "select id from birth_profile",
      ),
      positions: await client.query<{ body: string }>(
        "select body from planet_position",
      ),
    }));

    expect(a.profiles.rows.map((row) => row.id)).toEqual([profileA]);
    expect(a.births.rows.map((row) => row.id)).toEqual([birthProfileA]);
    expect(a.positions.rows.map((row) => row.body)).toEqual(["sun"]);
    expect(b.profiles.rows.map((row) => row.id)).toEqual([profileB]);
    expect(b.births.rowCount).toBe(0);
    expect(b.positions.rowCount).toBe(0);
  });

  it("blocks cross-owner insert, update, and delete operations", async () => {
    await expect(
      asUser(ownerA, (client) =>
        client.query(
          `insert into profile (owner_user_id, display_name, current_timezone)
           values ($1, 'Forbidden', 'UTC')`,
          [ownerB],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    const update = await asUser(ownerA, (client) =>
      client.query(
        "update profile set display_name = 'Changed' where id = $1",
        [profileB],
      ),
    );
    const deletion = await asUser(ownerA, (client) =>
      client.query("delete from profile where id = $1", [profileB]),
    );
    expect(update.rowCount).toBe(0);
    expect(deletion.rowCount).toBe(0);
  });

  it("maps verified subjects server-side and scopes database work", async () => {
    const accountA = await resolveActiveAccountId(
      pool,
      activeSession("test-owner-a"),
    );
    const accountB = await resolveActiveAccountId(
      pool,
      activeSession("test-owner-b"),
    );

    const visibleToA = await withIdentityTransaction(
      pool,
      accountA,
      ({ client }) => client.query<{ id: string }>("select id from profile"),
    );
    const aProfileVisibleToB = await withIdentityTransaction(
      pool,
      accountB,
      ({ client }) =>
        client.query<{ id: string }>("select id from profile where id = $1", [
          profileA,
        ]),
    );

    expect(visibleToA.rows.map((row) => row.id)).toEqual([profileA]);
    expect(aProfileVisibleToB.rowCount).toBe(0);
  });

  it("rolls back failed work and clears role and identity on pooled reuse", async () => {
    const singleConnectionPool = new Pool({ connectionString, max: 1 });
    const accountA = await resolveActiveAccountId(
      singleConnectionPool,
      activeSession("test-owner-a"),
    );

    await expect(
      withIdentityTransaction(
        singleConnectionPool,
        accountA,
        async ({ client }) => {
          await client.query(
            `insert into profile (owner_user_id, display_name, current_timezone)
           values ($1, 'Rollback marker', 'UTC')`,
            [accountA],
          );
          throw new Error("deliberate rollback");
        },
      ),
    ).rejects.toThrow("deliberate rollback");

    const state = await singleConnectionPool.query<{
      current_user: string;
      request_identity: string | null;
      rollback_rows: string;
    }>(
      `select current_user,
              nullif(current_setting('app.current_user_id', true), '') as request_identity,
              (select count(*) from profile where display_name = 'Rollback marker')::text as rollback_rows`,
    );
    expect(state.rows[0]).toEqual({
      current_user: "cosmic",
      request_identity: null,
      rollback_rows: "0",
    });
    await singleConnectionPool.end();
  });

  it("bootstraps idempotently and never reactivates a deleted subject", async () => {
    const session = activeSession("test-bootstrap-subject");
    const first = await bootstrapAccount(pool, session);
    const second = await bootstrapAccount(pool, session);
    expect(second).toBe(first);

    await pool.query(
      "update user_account set deleted_at = now() where id = $1",
      [first],
    );
    await expect(bootstrapAccount(pool, session)).rejects.toEqual(
      new AccountUnavailableError(),
    );
    await expect(resolveActiveAccountId(pool, session)).rejects.toEqual(
      new AccountUnavailableError(),
    );
    await pool.query("delete from user_account where id = $1", [first]);
  });

  it("cascades private child data when an account is deleted", async () => {
    await pool.query("delete from user_account where id = $1", [ownerA]);
    const counts = await pool.query<{
      profiles: string;
      runs: string;
      positions: string;
    }>(
      `select
         (select count(*) from profile where owner_user_id = $1)::text as profiles,
         (select count(*) from calculation_run where owner_user_id = $1)::text as runs,
         (select count(*) from planet_position where calculation_run_id = $2)::text as positions`,
      [ownerA, calculationRunA],
    );
    expect(counts.rows[0]).toEqual({
      profiles: "0",
      runs: "0",
      positions: "0",
    });
  });
});
