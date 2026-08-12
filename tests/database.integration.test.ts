import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AccountUnavailableError,
  bootstrapAccount,
  resolveActiveAccountId,
  type AccountId,
} from "@/infrastructure/auth/account";
import type { ActiveSession } from "@/infrastructure/auth/session";
import {
  CompatibilityReportRepository,
  InvalidStoredCompatibilityReportError,
} from "@/infrastructure/persistence/compatibility-report-repository";
import {
  SubscriptionIdentityConflictError,
  SubscriptionRepository,
} from "@/infrastructure/persistence/subscription-repository";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import { DEMO_COMPATIBILITY_REPORT } from "@/presentation/compatibility-demo";
import {
  SUBSCRIPTION_TRANSITION_EVENT_VERSION,
  type NormalizedSubscriptionEvent,
} from "@/domain/entitlements/subscription-transitions";

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
let birthProfileA2: string;
let birthProfileB: string;
let calculationRunA: string;
let compatibilityReportA: string;
let compatibilityReportA2: string;

const compatibilityRepository = new CompatibilityReportRepository(pool);
const subscriptionRepository = new SubscriptionRepository(pool);

function subscriptionEvent(
  overrides: Partial<NormalizedSubscriptionEvent> = {},
): NormalizedSubscriptionEvent {
  return {
    version: SUBSCRIPTION_TRANSITION_EVENT_VERSION,
    eventId: "evt_subscription_001",
    occurredAt: "2026-08-01T00:01:00.000Z",
    planKey: "personal",
    status: "active",
    periodStartsAt: "2026-08-01T00:00:00.000Z",
    periodEndsAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

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
  const additionalBirths = await pool.query<{
    id: string;
    profile_id: string;
  }>(
    `insert into birth_profile
       (profile_id, birth_date, timezone, birth_time_precision)
     values ($1, '2001-01-01', 'America/Toronto', 'date-only'),
            ($2, '2002-01-01', 'America/Toronto', 'date-only')
     returning id, profile_id`,
    [profileA, profileB],
  );
  birthProfileA2 = additionalBirths.rows.find(
    (row) => row.profile_id === profileA,
  )!.id;
  birthProfileB = additionalBirths.rows.find(
    (row) => row.profile_id === profileB,
  )!.id;

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
    expect(Number(tables.rows[0]!.count)).toBe(21);
    expect(Number(forcedPolicies.rows[0]!.count)).toBe(20);
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
    expect(names).toContain("subscription_event_receipt_provider_event_uidx");
    expect(names).toContain("subscription_event_receipt_subscription_idx");
  });
});

describe("compatibility report persistence and public share boundary", () => {
  it("round-trips a complete private report and fails closed across owners", async () => {
    compatibilityReportA = await compatibilityRepository.create(
      ownerA as AccountId,
      {
        primaryBirthProfileId: birthProfileA,
        comparisonBirthProfileId: birthProfileA2,
        report: DEMO_COMPATIBILITY_REPORT,
      },
    );
    const owned = await compatibilityRepository.findOwned(
      ownerA as AccountId,
      compatibilityReportA,
    );
    expect(owned).toMatchObject({
      id: compatibilityReportA,
      primaryBirthProfileId: birthProfileA,
      comparisonBirthProfileId: birthProfileA2,
      share: { visibility: "private", expiresAt: null, revokedAt: null },
    });
    expect(owned?.report).toEqual(DEMO_COMPATIBILITY_REPORT);
    expect(Object.isFrozen(owned)).toBe(true);
    expect(
      await compatibilityRepository.findOwned(
        ownerB as AccountId,
        compatibilityReportA,
      ),
    ).toBeNull();
    expect(
      await compatibilityRepository.deleteOwned(
        ownerB as AccountId,
        compatibilityReportA,
      ),
    ).toBe(false);
    const unauthenticated = await asUser(null, (client) =>
      client.query("select id from compatibility_report"),
    );
    expect(unauthenticated.rowCount).toBe(0);
  });

  it("rejects cross-owner birth-profile references at the RLS boundary", async () => {
    await expect(
      compatibilityRepository.create(ownerA as AccountId, {
        primaryBirthProfileId: birthProfileA,
        comparisonBirthProfileId: birthProfileB,
        report: DEMO_COMPATIBILITY_REPORT,
      }),
    ).rejects.toMatchObject({ code: "42501" });

    const count = await pool.query<{ count: string }>(
      `select count(*)::text as count from compatibility_report
       where owner_user_id = $1`,
      [ownerA],
    );
    expect(count.rows[0]!.count).toBe("1");
  });

  it("publishes, resolves, expires, republishes, and revokes without storing the bearer", async () => {
    const firstPublication = await compatibilityRepository.publishOwned(
      ownerA as AccountId,
      compatibilityReportA,
      "2099-01-01T00:00:00.000Z",
    );
    expect(firstPublication?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const firstToken = firstPublication!.token;
    const publicPayload =
      await compatibilityRepository.resolveActivePublic(firstToken);
    expect(publicPayload?.categories).toHaveLength(5);
    expect(publicPayload?.factors).toHaveLength(12);
    expect(JSON.stringify(publicPayload)).not.toContain("synastry:chart-a");
    expect(
      await compatibilityRepository.resolveActivePublic(
        "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).toBeNull();
    expect(
      await compatibilityRepository.resolveActivePublic("malformed"),
    ).toBeNull();

    const stored = await pool.query<{
      row_text: string;
      share_token_hash: string;
    }>(
      `select row_to_json(compatibility_report)::text as row_text,
              share_token_hash
       from compatibility_report where id = $1`,
      [compatibilityReportA],
    );
    expect(stored.rows[0]!.row_text).not.toContain(firstToken);
    expect(stored.rows[0]!.share_token_hash).toMatch(/^sha256:[a-f0-9]{64}$/);

    await pool.query(
      `update compatibility_report
       set share_expires_at = CURRENT_TIMESTAMP
       where id = $1`,
      [compatibilityReportA],
    );
    expect(
      await compatibilityRepository.resolveActivePublic(firstToken),
    ).toBeNull();

    const secondPublication = await compatibilityRepository.publishOwned(
      ownerA as AccountId,
      compatibilityReportA,
      null,
    );
    expect(secondPublication!.token).not.toBe(firstToken);
    expect(
      await compatibilityRepository.resolveActivePublic(firstToken),
    ).toBeNull();
    expect(
      await compatibilityRepository.resolveActivePublic(
        secondPublication!.token,
      ),
    ).not.toBeNull();
    expect(
      await compatibilityRepository.revokeOwned(
        ownerB as AccountId,
        compatibilityReportA,
      ),
    ).toBe(false);
    expect(
      await compatibilityRepository.revokeOwned(
        ownerA as AccountId,
        compatibilityReportA,
      ),
    ).toBe(true);
    expect(
      await compatibilityRepository.resolveActivePublic(
        secondPublication!.token,
      ),
    ).toBeNull();
    expect(
      await compatibilityRepository.revokeOwned(
        ownerA as AccountId,
        compatibilityReportA,
      ),
    ).toBe(false);

    const revoked = await pool.query<{
      share_state: string;
      public_share_payload: unknown;
      share_token_hash: string | null;
      share_revoked_at: Date | null;
    }>(
      `select share_state, public_share_payload, share_token_hash, share_revoked_at
       from compatibility_report where id = $1`,
      [compatibilityReportA],
    );
    expect(revoked.rows[0]).toMatchObject({
      share_state: "private",
      public_share_payload: null,
    });
    expect(revoked.rows[0]!.share_token_hash).not.toBeNull();
    expect(revoked.rows[0]!.share_revoked_at).toBeInstanceOf(Date);
  });

  it("rolls back digest collisions and rejects tampered stored payloads", async () => {
    compatibilityReportA2 = await compatibilityRepository.create(
      ownerA as AccountId,
      {
        primaryBirthProfileId: birthProfileA,
        comparisonBirthProfileId: birthProfileA2,
        report: DEMO_COMPATIBILITY_REPORT,
      },
    );
    const publication = await compatibilityRepository.publishOwned(
      ownerA as AccountId,
      compatibilityReportA,
      null,
    );
    const source = await pool.query<{
      public_share_payload: unknown;
      public_share_version: string;
      public_share_payload_digest: string;
      share_token_hash: string;
    }>(
      `select public_share_payload, public_share_version,
              public_share_payload_digest, share_token_hash
       from compatibility_report where id = $1`,
      [compatibilityReportA],
    );
    await expect(
      asUser(ownerA, (client) =>
        client.query(
          `update compatibility_report
           set share_state = 'public', public_share_payload = $2::json,
               public_share_version = $3, public_share_payload_digest = $4,
               share_token_hash = $5,
               share_revoked_at = null
           where id = $1`,
          [
            compatibilityReportA2,
            JSON.stringify(source.rows[0]!.public_share_payload),
            source.rows[0]!.public_share_version,
            source.rows[0]!.public_share_payload_digest,
            source.rows[0]!.share_token_hash,
          ],
        ),
      ),
    ).rejects.toMatchObject({ code: "23505" });
    const second = await compatibilityRepository.findOwned(
      ownerA as AccountId,
      compatibilityReportA2,
    );
    expect(second?.share.visibility).toBe("private");

    await pool.query(
      `update compatibility_report
       set public_share_payload = '{"version":"1.0.0"}'::json
       where id = $1`,
      [compatibilityReportA],
    );
    await expect(
      compatibilityRepository.resolveActivePublic(publication!.token),
    ).rejects.toEqual(new InvalidStoredCompatibilityReportError());
    await compatibilityRepository.revokeOwned(
      ownerA as AccountId,
      compatibilityReportA,
    );

    await pool.query(
      `update compatibility_report
       set report_payload = '{"invalid":true}'::json
       where id = $1`,
      [compatibilityReportA2],
    );
    await expect(
      compatibilityRepository.findOwned(
        ownerA as AccountId,
        compatibilityReportA2,
      ),
    ).rejects.toEqual(new InvalidStoredCompatibilityReportError());
  });

  it("keeps the anonymous role execute-only, uses the digest index, and clears pooled role state", async () => {
    const privileges = await pool.query<{
      can_execute: boolean;
      can_select: boolean;
      can_select_public: boolean;
      can_select_private: boolean;
    }>(
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
    expect(privileges.rows[0]).toEqual({
      can_execute: true,
      can_select: false,
      can_select_public: true,
      can_select_private: false,
    });
    const functionSecurity = await pool.query<{
      prosecdef: boolean;
      provolatile: string;
      policy_count: string;
    }>(
      `select prosecdef, provolatile,
              (select count(*)::text from pg_policies
               where schemaname = 'public'
                 and tablename = 'compatibility_report'
                 and policyname = 'compatibility_report_public_share')
                as policy_count
       from pg_proc
       where oid = 'app.current_share_token_hash()'::regprocedure`,
    );
    expect(functionSecurity.rows[0]).toEqual({
      prosecdef: false,
      provolatile: "s",
      policy_count: "1",
    });

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role app_share_reader");
      await client.query(
        "select set_config('app.current_share_token_hash', $1, true)",
        [`sha256:${"a".repeat(64)}`],
      );
      await client.query("set local enable_seqscan = off");
      const plan = await client.query(
        `explain (format json)
         select public_share_payload, public_share_payload_digest
         from compatibility_report`,
      );
      expect(JSON.stringify(plan.rows)).toContain(
        "compatibility_report_share_token_uidx",
      );
    } finally {
      await client.query("rollback");
      client.release();
    }

    const singleConnectionPool = new Pool({ connectionString, max: 1 });
    const isolatedRepository = new CompatibilityReportRepository(
      singleConnectionPool,
    );
    await isolatedRepository.resolveActivePublic(
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    const state = await singleConnectionPool.query<{
      current_user: string;
      request_identity: string | null;
      share_identity: string | null;
    }>(
      `select current_user,
              nullif(current_setting('app.current_user_id', true), '')
                as request_identity,
              nullif(current_setting('app.current_share_token_hash', true), '')
                as share_identity`,
    );
    expect(state.rows[0]).toEqual({
      current_user: "cosmic",
      request_identity: null,
      share_identity: null,
    });
    await singleConnectionPool.end();
  });

  it("deletes an owned public report and immediately removes public access", async () => {
    const reportId = await compatibilityRepository.create(ownerA as AccountId, {
      primaryBirthProfileId: birthProfileA,
      comparisonBirthProfileId: birthProfileA2,
      report: DEMO_COMPATIBILITY_REPORT,
    });
    const publication = await compatibilityRepository.publishOwned(
      ownerA as AccountId,
      reportId,
      null,
    );
    expect(
      await compatibilityRepository.resolveActivePublic(publication!.token),
    ).not.toBeNull();
    expect(
      await compatibilityRepository.deleteOwned(ownerA as AccountId, reportId),
    ).toBe(true);
    expect(
      await compatibilityRepository.resolveActivePublic(publication!.token),
    ).toBeNull();
    expect(
      await compatibilityRepository.deleteOwned(ownerA as AccountId, reportId),
    ).toBe(false);
  });
});

describe("subscription transition persistence and durable idempotency", () => {
  const identity = {
    provider: "test_payments",
    customerReference: "customer_owner_a",
    subscriptionReference: "subscription_owner_a",
  } as const;

  it("persists ordered transitions and globally durable event receipts", async () => {
    const firstEvent = subscriptionEvent();
    const first = await subscriptionRepository.applyNormalizedEvent(
      ownerA as AccountId,
      identity,
      firstEvent,
    );
    expect(first).toMatchObject({
      outcome: "applied",
      changed: true,
      entitlementState: { planKey: "personal", status: "active" },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.entitlementState)).toBe(true);
    expect(
      await subscriptionRepository.findEntitlementState(
        ownerB as AccountId,
        identity,
      ),
    ).toBeNull();

    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        firstEvent,
      ),
    ).toMatchObject({ outcome: "duplicate", changed: false });
    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        { ...firstEvent, planKey: "advanced" },
      ),
    ).toMatchObject({ outcome: "conflict", changed: false });

    const staleEvent = subscriptionEvent({
      eventId: "evt_subscription_stale",
      occurredAt: "2026-07-31T23:59:59.999Z",
    });
    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        staleEvent,
      ),
    ).toMatchObject({ outcome: "stale", changed: false });
    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        staleEvent,
      ),
    ).toMatchObject({ outcome: "duplicate", changed: false });

    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        subscriptionEvent({
          eventId: "evt_subscription_same_time",
        }),
      ),
    ).toMatchObject({ outcome: "conflict", changed: false });

    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        subscriptionEvent({
          eventId: "evt_subscription_renewal",
          occurredAt: "2026-08-02T00:01:00.000Z",
          planKey: "advanced",
          periodStartsAt: "2026-09-01T00:00:00.000Z",
          periodEndsAt: "2026-10-01T00:00:00.000Z",
        }),
      ),
    ).toMatchObject({
      outcome: "applied",
      entitlementState: { planKey: "advanced", status: "active" },
    });

    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        subscriptionEvent({
          eventId: "evt_subscription_paused",
          occurredAt: "2026-08-03T00:01:00.000Z",
          planKey: "advanced",
          status: "paused",
          periodStartsAt: "2026-09-01T00:00:00.000Z",
          periodEndsAt: "2026-09-20T00:00:00.000Z",
        }),
      ),
    ).toMatchObject({
      outcome: "applied",
      entitlementState: { status: "paused" },
    });

    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        subscriptionEvent({
          eventId: "evt_subscription_canceled",
          occurredAt: "2026-08-04T00:01:00.000Z",
          planKey: "advanced",
          status: "canceled",
          periodStartsAt: "2026-09-01T00:00:00.000Z",
          periodEndsAt: "2026-09-15T00:00:00.000Z",
        }),
      ),
    ).toMatchObject({
      outcome: "applied",
      entitlementState: { status: "canceled" },
    });

    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        subscriptionEvent({
          eventId: "evt_subscription_reactivate",
          occurredAt: "2026-08-05T00:01:00.000Z",
          planKey: "advanced",
          status: "active",
          periodStartsAt: "2026-09-01T00:00:00.000Z",
          periodEndsAt: "2026-10-15T00:00:00.000Z",
        }),
      ),
    ).toMatchObject({
      outcome: "invalid-transition",
      changed: false,
      entitlementState: { status: "canceled" },
    });

    const stored = await pool.query<{
      state_version: string;
      last_event_id: string;
      receipt_count: string;
      digest_count: string;
    }>(
      `select s.transition_state_version as state_version,
              s.last_provider_event_id as last_event_id,
              count(r.id)::text as receipt_count,
              count(*) filter (
                where r.normalized_event_digest ~ '^sha256:[0-9a-f]{64}$'
              )::text as digest_count
       from subscription s
       join subscription_provider_event_receipt r on r.subscription_id = s.id
       where s.external_provider = $1 and s.external_subscription_reference = $2
       group by s.id`,
      [identity.provider, identity.subscriptionReference],
    );
    expect(stored.rows[0]).toEqual({
      state_version: "1.0.0",
      last_event_id: "evt_subscription_canceled",
      receipt_count: "7",
      digest_count: "7",
    });
  });

  it("fails identity collisions, cross-owner access, and invalid input closed", async () => {
    await expect(
      subscriptionRepository.applyNormalizedEvent(
        ownerB as AccountId,
        identity,
        subscriptionEvent({
          eventId: "evt_cross_owner",
          occurredAt: "2026-08-06T00:01:00.000Z",
        }),
      ),
    ).rejects.toEqual(new SubscriptionIdentityConflictError());
    await expect(
      subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        { ...identity, customerReference: "wrong_customer" },
        subscriptionEvent({
          eventId: "evt_wrong_customer",
          occurredAt: "2026-08-06T00:01:00.000Z",
        }),
      ),
    ).rejects.toEqual(new SubscriptionIdentityConflictError());

    const collision = await subscriptionRepository.applyNormalizedEvent(
      ownerA as AccountId,
      {
        provider: identity.provider,
        customerReference: "customer_second",
        subscriptionReference: "subscription_second",
      },
      subscriptionEvent(),
    );
    expect(collision).toEqual({
      outcome: "conflict",
      changed: false,
      entitlementState: null,
    });

    await expect(
      subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        { ...identity, browserPlan: "advanced" } as typeof identity,
        subscriptionEvent(),
      ),
    ).rejects.toThrow("Subscription provider identity is invalid");
    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        identity,
        { ...subscriptionEvent(), priceId: "browser-price" },
      ),
    ).toEqual({
      outcome: "invalid-event",
      changed: false,
      entitlementState: null,
    });
  });

  it("serializes concurrent first delivery into one apply and one duplicate", async () => {
    const concurrentIdentity = {
      provider: "test_payments",
      customerReference: "customer_concurrent",
      subscriptionReference: "subscription_concurrent",
    } as const;
    const concurrentEvent = subscriptionEvent({
      eventId: "evt_concurrent_initial",
      occurredAt: "2026-08-10T00:01:00.000Z",
    });
    const results = await Promise.all([
      subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        concurrentIdentity,
        concurrentEvent,
      ),
      subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        concurrentIdentity,
        concurrentEvent,
      ),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      "applied",
      "duplicate",
    ]);
    const persisted = await pool.query<{
      subscriptions: string;
      receipts: string;
    }>(
      `select
         (select count(*) from subscription
           where external_provider = $1 and external_subscription_reference = $2)::text
           as subscriptions,
         (select count(*) from subscription_provider_event_receipt
           where external_provider = $1 and provider_event_id = $3)::text as receipts`,
      [
        concurrentIdentity.provider,
        concurrentIdentity.subscriptionReference,
        concurrentEvent.eventId,
      ],
    );
    expect(persisted.rows[0]).toEqual({ subscriptions: "1", receipts: "1" });
  });

  it("leaves legacy rows unverified and enforces receipt immutability", async () => {
    const legacy = await pool.query<{ id: string }>(
      `insert into subscription
         (user_account_id, plan_key, status, external_provider,
          external_customer_reference, external_subscription_reference,
          period_starts_at, period_ends_at, last_provider_event_id)
       values ($1, 'legacy-plan', 'active', 'legacy-test',
               'legacy-customer-a', 'legacy-subscription-a',
               '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', 'legacy-event-a')
       returning id`,
      [ownerA],
    );
    const legacyIdentity = {
      provider: "legacy-test",
      customerReference: "legacy-customer-a",
      subscriptionReference: "legacy-subscription-a",
    } as const;
    expect(
      await subscriptionRepository.findEntitlementState(
        ownerA as AccountId,
        legacyIdentity,
      ),
    ).toBeNull();
    expect(
      await subscriptionRepository.applyNormalizedEvent(
        ownerA as AccountId,
        legacyIdentity,
        subscriptionEvent({ eventId: "evt_legacy_resync" }),
      ),
    ).toEqual({
      outcome: "invalid-current-state",
      changed: false,
      entitlementState: null,
    });

    await expect(
      asUser(ownerA, (client) =>
        client.query(
          "update subscription_provider_event_receipt set outcome = 'applied'",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const boundary = await pool.query<{
      forced: boolean;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
    }>(
      `select c.relforcerowsecurity as forced,
              has_table_privilege('app_user', c.oid, 'SELECT') as can_select,
              has_table_privilege('app_user', c.oid, 'INSERT') as can_insert,
              has_table_privilege('app_user', c.oid, 'UPDATE') as can_update,
              has_table_privilege('app_user', c.oid, 'DELETE') as can_delete
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'subscription_provider_event_receipt'`,
    );
    expect(boundary.rows[0]).toEqual({
      forced: true,
      can_select: true,
      can_insert: true,
      can_update: false,
      can_delete: false,
    });
    const plan = await asUser(ownerA, async (client) => {
      await client.query("set local enable_seqscan = off");
      return client.query(
        `explain (format json)
         select subscription_id, normalized_event_digest
         from subscription_provider_event_receipt
         where external_provider = 'test_payments'
           and provider_event_id = 'evt_subscription_001'`,
      );
    });
    expect(JSON.stringify(plan.rows)).toContain(
      "subscription_event_receipt_provider_event_uidx",
    );
    const stillLegacy = await pool.query<{
      transition_state_version: string | null;
    }>("select transition_state_version from subscription where id = $1", [
      legacy.rows[0]!.id,
    ]);
    expect(stillLegacy.rows[0]!.transition_state_version).toBeNull();
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
      subscriptions: await client.query<{ id: string }>(
        "select id from subscription",
      ),
      receipts: await client.query<{ id: string }>(
        "select id from subscription_provider_event_receipt",
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
      subscriptions: await client.query<{ id: string }>(
        "select id from subscription",
      ),
      receipts: await client.query<{ id: string }>(
        "select id from subscription_provider_event_receipt",
      ),
    }));

    expect(a.profiles.rows.map((row) => row.id)).toEqual([profileA]);
    expect(new Set(a.births.rows.map((row) => row.id))).toEqual(
      new Set([birthProfileA, birthProfileA2]),
    );
    expect(a.positions.rows.map((row) => row.body)).toEqual(["sun"]);
    expect(a.subscriptions.rowCount).toBe(3);
    expect(a.receipts.rowCount).toBe(8);
    expect(b.profiles.rows.map((row) => row.id)).toEqual([profileB]);
    expect(b.births.rows.map((row) => row.id)).toEqual([birthProfileB]);
    expect(b.positions.rowCount).toBe(0);
    expect(b.subscriptions.rowCount).toBe(0);
    expect(b.receipts.rowCount).toBe(0);
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
      compatibility_reports: string;
      subscriptions: string;
      subscription_receipts: string;
    }>(
      `select
         (select count(*) from profile where owner_user_id = $1)::text as profiles,
         (select count(*) from calculation_run where owner_user_id = $1)::text as runs,
         (select count(*) from planet_position where calculation_run_id = $2)::text as positions,
         (select count(*) from compatibility_report where owner_user_id = $1)::text
           as compatibility_reports,
         (select count(*) from subscription where user_account_id = $1)::text
           as subscriptions,
         (select count(*) from subscription_provider_event_receipt r
            join subscription s on s.id = r.subscription_id
           where s.user_account_id = $1)::text as subscription_receipts`,
      [ownerA, calculationRunA],
    );
    expect(counts.rows[0]).toEqual({
      profiles: "0",
      runs: "0",
      positions: "0",
      compatibility_reports: "0",
      subscriptions: "0",
      subscription_receipts: "0",
    });
  });
});
