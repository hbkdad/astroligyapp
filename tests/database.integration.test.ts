import { createHash, randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AccountUnavailableError,
  bootstrapAccount,
  LocalAccountDeletionRepository,
  resolveActiveAccountId,
  type AccountId,
} from "@/infrastructure/auth/account";
import {
  BetterAuthAccountBootstrapper,
  BetterAuthActiveBillingAccountResolver,
  BetterAuthCurrentPasswordReauthenticator,
  BetterAuthTrustedBillingContactResolver,
  BetterAuthVerifiedSessionVerifier,
  IdentityScopedAccountReadinessVerifier,
} from "@/infrastructure/auth/better-auth-adapters";
import { betterAuthSchema } from "@/db/auth-schema";
import { createBetterAuth } from "@/server/better-auth-configuration";
import { createBetterAuthHttpHandler } from "@/server/better-auth-http";
import { bootstrapAccountForRequest } from "@/server/authenticated-account-bootstrap";
import { activateAccountFromHeaders } from "@/server/account-activation-action";
import { deleteAccountFromForm } from "@/server/account-deletion-action";
import { deleteAccountForRequest } from "@/server/authenticated-account-deletion";
import type { AuthenticationEmailRequest } from "@/server/authentication-email";
import { AuthenticationEmailFeedbackRepository } from "@/server/authentication-email-feedback";
import { AuthenticationEmailIdempotencyRepository } from "@/server/authentication-email-idempotency";
import type { ActiveSession } from "@/infrastructure/auth/session";
import {
  CompatibilityReportRepository,
  InvalidStoredCompatibilityReportError,
} from "@/infrastructure/persistence/compatibility-report-repository";
import {
  BillingCustomerBindingConflictError,
  BillingCustomerBindingRepository,
  BillingCustomerOwnerResolver,
} from "@/infrastructure/persistence/billing-customer-binding-repository";
import {
  SubscriptionIdentityConflictError,
  SubscriptionRepository,
} from "@/infrastructure/persistence/subscription-repository";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import {
  PrivateProfileAuthorizationError,
  PrivateProfileConflictError,
  PrivateProfileLimitError,
  PrivateProfileRepository,
} from "@/infrastructure/persistence/private-profile-repository";
import { mutatePrivateProfileForRequest } from "@/server/authenticated-private-profiles";
import { mutatePrivateProfileFromForm } from "@/server/private-profile-action";
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
const authEmailMessages: AuthenticationEmailRequest[] = [];
const auth = createBetterAuth(
  drizzle(pool, { schema: betterAuthSchema }),
  {
    dispatcher: {
      dispatch: async (message) => {
        authEmailMessages.push(message);
        return {
          version: "1.0.0",
          disposition: "accepted",
          code: "EMAIL_ACCEPTED",
        };
      },
    },
    idempotencyReferences: {
      create: ({ purpose, token }) =>
        createHash("sha256")
          .update(`database-test:${purpose}:${token}`)
          .digest("base64url"),
    },
  },
  {
    baseUrl: "https://app.example.test",
    trustedOrigins: ["https://app.example.test"],
    secrets: [
      {
        version: 1,
        value: "database-integration-only-secret-value-00000001",
      },
    ],
    production: false,
  },
);
const authHttp = createBetterAuthHttpHandler(
  "https://app.example.test",
  () => ({ handle: (request) => auth.handler(request) }),
);
const ownerA = randomUUID();
const ownerB = randomUUID();
const authSessionA = "auth-session-owner-a";
const authSessionB = "auth-session-owner-b";
const authEmailKey = createHash("sha256")
  .update("database-auth-email-key")
  .digest("base64url");
let authEmailNow = new Date("2026-08-12T12:00:00.000Z");
const authEmailIdempotency = new AuthenticationEmailIdempotencyRepository(
  pool,
  {
    keys: [{ version: 1, value: authEmailKey }],
    leaseMilliseconds: 60_000,
  },
  "https://app.example.test",
  () => authEmailNow,
);
const authEmailFeedbackKey = createHash("sha256")
  .update("database-auth-email-feedback-key")
  .digest("base64url");
const authEmailFeedbackNow = new Date("2026-08-12T14:00:00.000Z");
const authEmailFeedback = new AuthenticationEmailFeedbackRepository(
  pool,
  {
    keys: [{ version: 1, value: authEmailFeedbackKey }],
    topicArn: "arn:aws:sns:ca-central-1:123456789012:authentication-feedback",
    identityArn:
      "arn:aws:ses:ca-central-1:123456789012:identity/auth.example.test",
    sender: "security@auth.example.test",
    configurationSet: "authentication-events",
  },
  () => authEmailFeedbackNow,
);

function authEmailRequest(
  reference: string,
  recipient = "delivery@example.test",
): AuthenticationEmailRequest {
  return {
    version: "1.0.0",
    purpose: "verify-email",
    recipient,
    actionUrl:
      "https://app.example.test/api/auth/verify-email?token=header.payload.signature&callbackURL=%2F",
    templateVersion: "auth.verify-email.en-CA.1",
    idempotencyReference: reference,
  };
}
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
const billingBindingRepository = new BillingCustomerBindingRepository(pool);
const billingOwnerResolver = new BillingCustomerOwnerResolver(pool);
const authContactResolver = new BetterAuthTrustedBillingContactResolver(pool);
const authAccountResolver = new BetterAuthActiveBillingAccountResolver(pool);
const authAccountBootstrapper = new BetterAuthAccountBootstrapper(pool);
const authAccountReadiness = new IdentityScopedAccountReadinessVerifier(pool);
const localAccountDeletion = new LocalAccountDeletionRepository(pool);

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

function betterAuthSession(subject: string, sessionId: string): ActiveSession {
  return {
    status: "active",
    subject,
    sessionId,
    authenticatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
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
  await pool.query(
    `insert into auth."user"
       (id, name, email, email_verified, created_at, updated_at)
     values
       ('test-owner-a', 'Auth fixture A', 'owner-a@example.test', true,
        '2026-08-09T11:59:00Z', '2026-08-09T11:59:00Z'),
       ('test-owner-b', 'Auth fixture B', 'owner-b@example.test', true,
        '2026-08-09T11:59:00Z', '2026-08-09T11:59:00Z')`,
  );
  await pool.query(
    `insert into auth."session"
       (id, token, user_id, created_at, updated_at, expires_at)
     values
       ($1, 'auth-token-owner-a', 'test-owner-a',
        CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + interval '1 hour'),
       ($2, 'auth-token-owner-b', 'test-owner-b',
        CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + interval '1 hour')`,
    [authSessionA, authSessionB],
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
    expect(Number(tables.rows[0]!.count)).toBe(25);
    expect(Number(forcedPolicies.rows[0]!.count)).toBe(24);
  });

  it("isolates the exact Better Auth schema and runtime privileges", async () => {
    const authTables = await pool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'auth' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    expect(authTables.rows.map((row) => row.table_name)).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);

    const privileges = await pool.query<{
      app_user_schema: boolean;
      app_user_table: boolean;
      auth_runtime_schema: boolean;
      auth_runtime_table: boolean;
      contact_direct_table: boolean;
      contact_execute: boolean;
      account_direct_table: boolean;
      account_execute: boolean;
      migrator_retains_owner: boolean;
      migrator_retains_account_owner: boolean;
      email_runtime_select: boolean;
      email_runtime_write: boolean;
      email_runtime_delete: boolean;
      app_user_email_table: boolean;
      feedback_consumer_receipt_read: boolean;
      feedback_consumer_receipt_insert: boolean;
      feedback_consumer_receipt_mutate: boolean;
      feedback_consumer_suppression_read: boolean;
      feedback_consumer_suppression_insert: boolean;
      feedback_consumer_suppression_mutate: boolean;
      feedback_consumer_delivery_update: boolean;
      bootstrap_direct_table: boolean;
      bootstrap_execute: boolean;
      migrator_retains_bootstrap_owner: boolean;
      deletion_direct_account: boolean;
      deletion_execute: boolean;
      migrator_retains_deletion_owner: boolean;
    }>(
      `select
         has_schema_privilege('app_user', 'auth', 'USAGE') as app_user_schema,
         has_table_privilege('app_user', 'auth."user"', 'SELECT') as app_user_table,
         has_schema_privilege('app_auth_runtime', 'auth', 'USAGE') as auth_runtime_schema,
         has_table_privilege('app_auth_runtime', 'auth."user"', 'SELECT,INSERT,UPDATE,DELETE') as auth_runtime_table,
         has_table_privilege('app_auth_contact_resolver', 'auth."user"', 'SELECT') as contact_direct_table,
         has_function_privilege(
           'app_auth_contact_resolver',
           'app.resolve_verified_auth_contact(text,text,uuid)',
           'EXECUTE'
         ) as contact_execute,
         has_table_privilege(
           'app_auth_account_resolver', 'user_account', 'SELECT'
         ) as account_direct_table,
         has_function_privilege(
           'app_auth_account_resolver',
           'app.resolve_active_auth_account(text)',
           'EXECUTE'
         ) as account_execute,
         exists (
           select 1 from pg_auth_members membership
           join pg_roles member_role on member_role.oid = membership.member
           join pg_roles granted_role on granted_role.oid = membership.roleid
           where member_role.rolname = current_user
             and granted_role.rolname = 'app_auth_contact_owner'
         ) as migrator_retains_owner,
         exists (
           select 1 from pg_auth_members membership
           join pg_roles member_role on member_role.oid = membership.member
           join pg_roles granted_role on granted_role.oid = membership.roleid
           where member_role.rolname = current_user
             and granted_role.rolname = 'app_auth_account_owner'
         ) as migrator_retains_account_owner,
         has_table_privilege(
           'app_auth_email_runtime', 'authentication_email_delivery', 'SELECT'
         ) as email_runtime_select,
         has_table_privilege(
           'app_auth_email_runtime', 'authentication_email_delivery', 'INSERT,UPDATE'
         ) as email_runtime_write,
         has_table_privilege(
           'app_auth_email_runtime', 'authentication_email_delivery', 'DELETE'
         ) as email_runtime_delete,
         has_table_privilege(
           'app_user', 'authentication_email_delivery', 'SELECT'
         ) as app_user_email_table,
         has_table_privilege(
           'app_auth_email_feedback_consumer',
           'authentication_email_feedback_receipt', 'SELECT'
         ) as feedback_consumer_receipt_read,
         has_table_privilege(
           'app_auth_email_feedback_consumer',
           'authentication_email_feedback_receipt', 'INSERT'
         ) as feedback_consumer_receipt_insert,
         has_table_privilege(
           'app_auth_email_feedback_consumer',
           'authentication_email_feedback_receipt', 'UPDATE,DELETE'
         ) as feedback_consumer_receipt_mutate,
         has_table_privilege(
           'app_auth_email_feedback_consumer',
           'authentication_email_suppression', 'SELECT'
         ) as feedback_consumer_suppression_read,
         has_table_privilege(
           'app_auth_email_feedback_consumer',
           'authentication_email_suppression', 'INSERT'
         ) as feedback_consumer_suppression_insert,
         has_table_privilege(
           'app_auth_email_feedback_consumer',
           'authentication_email_suppression', 'UPDATE,DELETE'
         ) as feedback_consumer_suppression_mutate,
         has_table_privilege(
           'app_auth_email_feedback_consumer',
           'authentication_email_delivery', 'UPDATE'
         ) as feedback_consumer_delivery_update,
         has_table_privilege(
           'app_auth_account_bootstrap', 'user_account', 'SELECT,INSERT,UPDATE'
         ) as bootstrap_direct_table,
         has_function_privilege(
           'app_auth_account_bootstrap',
           'app.bootstrap_auth_account(text)', 'EXECUTE'
         ) as bootstrap_execute,
         exists (
           select 1 from pg_auth_members membership
           join pg_roles member_role on member_role.oid = membership.member
           join pg_roles granted_role on granted_role.oid = membership.roleid
           where member_role.rolname = current_user
             and granted_role.rolname = 'app_auth_account_bootstrap_owner'
         ) as migrator_retains_bootstrap_owner,
         has_table_privilege(
           'app_account_deletion', 'user_account', 'SELECT,UPDATE,DELETE'
         ) as deletion_direct_account,
         has_function_privilege(
           'app_account_deletion',
           'app.erase_local_auth_account(text,text,uuid)', 'EXECUTE'
         ) as deletion_execute,
         exists (
           select 1 from pg_auth_members membership
           join pg_roles member_role on member_role.oid = membership.member
           join pg_roles granted_role on granted_role.oid = membership.roleid
           where member_role.rolname = current_user
             and granted_role.rolname = 'app_account_deletion_owner'
         ) as migrator_retains_deletion_owner`,
    );
    expect(privileges.rows[0]).toEqual({
      app_user_schema: false,
      app_user_table: false,
      auth_runtime_schema: true,
      auth_runtime_table: true,
      contact_direct_table: false,
      contact_execute: true,
      account_direct_table: false,
      account_execute: true,
      migrator_retains_owner: false,
      migrator_retains_account_owner: false,
      email_runtime_select: true,
      email_runtime_write: true,
      email_runtime_delete: false,
      app_user_email_table: false,
      feedback_consumer_receipt_read: true,
      feedback_consumer_receipt_insert: true,
      feedback_consumer_receipt_mutate: false,
      feedback_consumer_suppression_read: true,
      feedback_consumer_suppression_insert: true,
      feedback_consumer_suppression_mutate: false,
      feedback_consumer_delivery_update: true,
      bootstrap_direct_table: false,
      bootstrap_execute: true,
      migrator_retains_bootstrap_owner: false,
      deletion_direct_account: false,
      deletion_execute: true,
      migrator_retains_deletion_owner: false,
    });
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
    expect(names).toContain("billing_customer_binding_provider_customer_uidx");
    expect(names).toContain("billing_customer_binding_owner_provider_uidx");
    expect(names).toContain("authentication_email_delivery_reference_uidx");
    expect(names).toContain(
      "authentication_email_delivery_provider_reference_uidx",
    );
    expect(names).toContain("authentication_email_delivery_recovery_idx");
    expect(names).toContain("authentication_email_feedback_event_uidx");
    expect(names).toContain("authentication_email_feedback_delivery_idx");
    expect(names).toContain("authentication_email_feedback_retention_idx");
    expect(names).toContain("authentication_email_suppression_recipient_uidx");
    expect(names).toContain("authentication_email_suppression_retention_idx");
  });
});

function authHttpPost(
  path: string,
  body?: Readonly<Record<string, unknown>>,
  cookie?: string,
  ipAddress = "198.51.100.40",
): Promise<Response> {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  return authHttp(
    new Request(`https://app.example.test${path}`, {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": ipAddress,
        ...(raw === undefined
          ? {}
          : {
              "content-type": "application/json",
              "content-length": String(Buffer.byteLength(raw)),
            }),
        ...(cookie ? { cookie } : {}),
      },
      ...(raw === undefined ? {} : { body: raw }),
    }),
  );
}

function authHttpGet(
  path: string,
  cookie?: string,
  site = "same-origin",
): Promise<Response> {
  return authHttp(
    new Request(`https://app.example.test${path}`, {
      headers: {
        "sec-fetch-site": site,
        ...(cookie ? { cookie } : {}),
      },
    }),
  );
}

describe("Better Auth public HTTP lifecycle", () => {
  it("signs up, verifies, signs in, projects a session, signs out, and anti-enumerates duplicates", async () => {
    const email = `http-${randomUUID()}@example.test`;
    const password = "http-integration-password-123";
    const messagesBefore = authEmailMessages.length;
    const signUp = await authHttpPost("/api/auth/sign-up/email", {
      name: "HTTP fixture",
      email,
      password,
      callbackURL: "/account",
    });
    expect(signUp.status).toBe(200);
    expect(await signUp.json()).toEqual({ status: "accepted" });
    expect(signUp.headers.get("set-cookie")).toBeNull();
    expect(authEmailMessages).toHaveLength(messagesBefore + 1);

    const duplicate = await authHttpPost("/api/auth/sign-up/email", {
      name: "HTTP fixture",
      email,
      password,
      callbackURL: "/account",
    });
    expect(duplicate.status).toBe(signUp.status);
    expect(await duplicate.json()).toEqual({ status: "accepted" });
    const users = await pool.query<{ id: string; email_verified: boolean }>(
      `select id, email_verified from auth."user" where email = $1`,
      [email],
    );
    expect(users.rowCount).toBe(1);
    expect(users.rows[0]!.email_verified).toBe(false);

    const verification = new URL(authEmailMessages.at(-1)!.actionUrl);
    const verified = await authHttpGet(
      `${verification.pathname}${verification.search}`,
      undefined,
      "cross-site",
    );
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("/account");

    const wrongExisting = await authHttpPost("/api/auth/sign-in/email", {
      email,
      password: "wrong-password-value-123",
    });
    const wrongMissing = await authHttpPost("/api/auth/sign-in/email", {
      email: `missing-${randomUUID()}@example.test`,
      password: "wrong-password-value-123",
    });
    expect(wrongExisting.status).toBe(wrongMissing.status);
    expect(await wrongExisting.json()).toEqual({ status: "rejected" });
    expect(await wrongMissing.json()).toEqual({ status: "rejected" });

    const signIn = await authHttpPost("/api/auth/sign-in/email", {
      email,
      password,
    });
    expect(signIn.status).toBe(200);
    expect(await signIn.json()).toEqual({ status: "authenticated" });
    const setCookie = signIn.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);
    const cookie = setCookie.split(";", 1)[0]!;

    const session = await authHttpGet("/api/auth/get-session", cookie);
    expect(session.status).toBe(200);
    const projected = await session.json();
    expect(projected).toEqual({
      status: "authenticated",
      user: { name: "HTTP fixture", email, emailVerified: true },
    });
    expect(JSON.stringify(projected)).not.toMatch(/token|session|ipAddress/);
    expect(JSON.stringify(projected)).not.toContain(users.rows[0]!.id);

    const signOut = await authHttpPost("/api/auth/sign-out", undefined, cookie);
    expect(await signOut.json()).toEqual({ status: "accepted" });
    const signedOutSession = await authHttpGet("/api/auth/get-session", cookie);
    expect(await signedOutSession.json()).toEqual({ status: "anonymous" });
    await pool.query(`delete from auth."user" where id = $1`, [
      users.rows[0]!.id,
    ]);
  });

  it("anti-enumerates reset requests, keeps tokens in the recovery flow, and revokes sessions", async () => {
    const email = `reset-http-${randomUUID()}@example.test`;
    const password = "reset-http-password-123";
    const replacement = "reset-http-replacement-456";
    const signUp = await auth.api.signUpEmail({
      body: { name: "Reset HTTP fixture", email, password },
    });
    await pool.query(
      `update auth."user" set email_verified = true where id = $1`,
      [signUp.user.id],
    );
    const signIn = await authHttpPost("/api/auth/sign-in/email", {
      email,
      password,
    });
    const cookie = signIn.headers.get("set-cookie")!.split(";", 1)[0]!;
    const messagesBefore = authEmailMessages.length;
    const existing = await authHttpPost("/api/auth/request-password-reset", {
      email,
      redirectTo: "/account/reset-password",
    });
    const missing = await authHttpPost("/api/auth/request-password-reset", {
      email: `missing-${randomUUID()}@example.test`,
      redirectTo: "/account/reset-password",
    });
    expect(existing.status).toBe(missing.status);
    expect(await existing.json()).toEqual({ status: "accepted" });
    expect(await missing.json()).toEqual({ status: "accepted" });
    expect(authEmailMessages).toHaveLength(messagesBefore + 1);

    const resetLink = new URL(authEmailMessages.at(-1)!.actionUrl);
    const callback = await authHttpGet(
      `${resetLink.pathname}${resetLink.search}`,
      undefined,
      "cross-site",
    );
    expect(callback.status).toBe(302);
    const callbackLocation = new URL(callback.headers.get("location")!);
    expect(callbackLocation.pathname).toBe("/account/reset-password");
    const token = callbackLocation.searchParams.get("token")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const reset = await authHttpPost("/api/auth/reset-password", {
      newPassword: replacement,
      token,
    });
    expect(await reset.json()).toEqual({ status: "accepted" });
    const oldSession = await authHttpGet("/api/auth/get-session", cookie);
    expect(await oldSession.json()).toEqual({ status: "anonymous" });
    const newSignIn = await authHttpPost("/api/auth/sign-in/email", {
      email,
      password: replacement,
    });
    expect(await newSignIn.json()).toEqual({ status: "authenticated" });
    await pool.query(`delete from auth."user" where id = $1`, [signUp.user.id]);
  });

  it("enforces the selected sign-in rate-limit seam with fixed private output", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 100 + 100)}`;
    const responses: Response[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await authHttpPost(
          "/api/auth/sign-in/email",
          {
            email: `rate-${randomUUID()}@example.test`,
            password: "rate-limit-password-123",
          },
          undefined,
          ip,
        ),
      );
    }
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(1);
    expect(await responses.at(-1)!.json()).toEqual({ status: "rate-limited" });
  });
});

describe("Better Auth trusted contact isolation", () => {
  it("runs the pinned Better Auth email/password and immediate-revocation path against PostgreSQL", async () => {
    const email = `runtime-${randomUUID()}@example.test`;
    const password = "integration-only-password-123";
    const signUp = await auth.api.signUpEmail({
      body: { name: "Runtime fixture", email, password },
    });
    expect(signUp.token).toBeNull();
    expect(signUp.user.emailVerified).toBe(false);
    expect(authEmailMessages.at(-1)).toMatchObject({ recipient: email });

    await pool.query(
      `update auth."user" set email_verified = true where id = $1`,
      [signUp.user.id],
    );
    const signInResponse = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    const setCookie = signInResponse.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    const headers = new Headers({
      cookie: setCookie!.split(";", 1)[0]!,
      origin: "https://app.example.test",
    });
    const active = await auth.api.getSession({ headers });
    expect(active?.user.id).toBe(signUp.user.id);
    expect(active?.session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const bootstrapDependencies = {
      sessionVerifier: new BetterAuthVerifiedSessionVerifier(auth.api),
      bootstrapper: authAccountBootstrapper,
      accountResolver: authAccountResolver,
      readinessVerifier: authAccountReadiness,
    };
    const activationService = {
      canonicalOrigin: "https://app.example.test",
      activateAccount: (request: Request) =>
        bootstrapAccountForRequest(request, bootstrapDependencies),
    };
    await expect(
      activateAccountFromHeaders(headers, false, () => activationService),
    ).resolves.toEqual({ status: "ready" });
    const internal = await pool.query<{ id: string }>(
      `select id from user_account where identity_provider_subject = $1`,
      [signUp.user.id],
    );
    expect(internal.rowCount).toBe(1);

    await auth.api.revokeSessions({ headers });
    await expect(auth.api.getSession({ headers })).resolves.toBeNull();
    await expect(
      activateAccountFromHeaders(headers, false, () => activationService),
    ).resolves.toEqual({ status: "authenticate" });
    await pool.query("delete from user_account where id = $1", [
      internal.rows[0]!.id,
    ]);
    await pool.query(`delete from auth."user" where id = $1`, [signUp.user.id]);
  });

  it("returns only the current verified contact for the matching recent session and owner", async () => {
    await expect(
      authAccountResolver.resolveActiveAccount(
        betterAuthSession("test-owner-a", authSessionA),
      ),
    ).resolves.toBe(ownerA);
    await expect(
      authAccountResolver.resolveActiveAccount(
        betterAuthSession("unknown-owner", "unknown-session"),
      ),
    ).rejects.toBeInstanceOf(AccountUnavailableError);

    await expect(
      authContactResolver.resolveTrustedContact(
        betterAuthSession("test-owner-a", authSessionA),
        ownerA as AccountId,
      ),
    ).resolves.toEqual({ email: "owner-a@example.test" });

    await expect(
      authContactResolver.resolveTrustedContact(
        betterAuthSession("test-owner-a", authSessionA),
        ownerB as AccountId,
      ),
    ).resolves.toBeNull();
    await expect(
      authContactResolver.resolveTrustedContact(
        betterAuthSession("test-owner-b", authSessionB),
        ownerA as AccountId,
      ),
    ).resolves.toBeNull();
  });

  it("fails closed for unverified, malformed, changed, stale, expired, and revoked state", async () => {
    const session = betterAuthSession("test-owner-a", authSessionA);
    const owner = ownerA as AccountId;

    await pool.query(
      `update auth."user" set email_verified = false where id = 'test-owner-a'`,
    );
    await expect(
      authContactResolver.resolveTrustedContact(session, owner),
    ).resolves.toBeNull();

    await pool.query(
      `update auth."user"
       set email_verified = true, email = 'invalid-address'
       where id = 'test-owner-a'`,
    );
    await expect(
      authContactResolver.resolveTrustedContact(session, owner),
    ).resolves.toBeNull();

    await pool.query(
      `update auth."user" set email = 'changed@example.test' where id = 'test-owner-a'`,
    );
    await expect(
      authContactResolver.resolveTrustedContact(session, owner),
    ).resolves.toEqual({ email: "changed@example.test" });

    await pool.query(
      `update auth."session"
       set created_at = CURRENT_TIMESTAMP - interval '11 minutes'
       where id = $1`,
      [authSessionA],
    );
    await expect(
      authContactResolver.resolveTrustedContact(session, owner),
    ).resolves.toBeNull();

    await pool.query(
      `update auth."session"
       set created_at = CURRENT_TIMESTAMP - interval '1 minute',
           expires_at = CURRENT_TIMESTAMP - interval '1 second'
       where id = $1`,
      [authSessionA],
    );
    await expect(
      authContactResolver.resolveTrustedContact(session, owner),
    ).resolves.toBeNull();

    await pool.query(`delete from auth."session" where id = $1`, [
      authSessionA,
    ]);
    await expect(
      authContactResolver.resolveTrustedContact(session, owner),
    ).resolves.toBeNull();

    await pool.query(
      `update auth."user"
       set email = 'owner-a@example.test'
       where id = 'test-owner-a'`,
    );
    await pool.query(
      `insert into auth."session"
         (id, token, user_id, created_at, updated_at, expires_at)
       values ($1, 'auth-token-owner-a-restored', 'test-owner-a',
         CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP + interval '1 hour')`,
      [authSessionA],
    );
  });

  it("fails closed for a deleted internal account and restores no pooled role", async () => {
    const session = betterAuthSession("test-owner-a", authSessionA);
    await pool.query(
      `update user_account set deleted_at = now() where id = $1`,
      [ownerA],
    );
    await expect(
      authContactResolver.resolveTrustedContact(session, ownerA as AccountId),
    ).resolves.toBeNull();
    await expect(
      authAccountResolver.resolveActiveAccount(session),
    ).rejects.toBeInstanceOf(AccountUnavailableError);
    await pool.query(
      `update user_account set deleted_at = null where id = $1`,
      [ownerA],
    );

    const role = await pool.query<{
      current_role: string;
      current_user: string;
    }>(`select current_role, current_user`);
    expect(role.rows[0]!.current_role).toBe(role.rows[0]!.current_user);
  });

  it("prevents application and contact-executor roles from directly reading auth rows", async () => {
    for (const role of [
      "app_user",
      "app_auth_account_resolver",
      "app_auth_account_bootstrap",
      "app_account_deletion",
      "app_auth_contact_resolver",
    ] as const) {
      await expect(
        asDatabaseRole(role, (client) =>
          client.query(`select email from auth."user"`),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("allows the auth runtime only its generated tables", async () => {
    await asDatabaseRole("app_auth_runtime", async (client) => {
      await client.query(
        `insert into auth."user" (id, name, email, email_verified)
         values ('runtime-role-user', 'Runtime role', 'runtime-role@example.test', false)`,
      );
      const row = await client.query<{ email_verified: boolean }>(
        `select email_verified from auth."user" where id = 'runtime-role-user'`,
      );
      expect(row.rows[0]?.email_verified).toBe(false);
      await client.query(
        `delete from auth."user" where id = 'runtime-role-user'`,
      );
    });

    await expect(
      asDatabaseRole("app_auth_runtime", (client) =>
        client.query(`select id from public.user_account`),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("allows the bootstrap executor only its function and no direct account rows", async () => {
    await expect(
      asDatabaseRole("app_auth_account_bootstrap", (client) =>
        client.query("select id from user_account"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asDatabaseRole("app_auth_account_bootstrap", (client) =>
        client.query(
          `insert into user_account (identity_provider_subject)
           values ('forbidden-direct-bootstrap')`,
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asDatabaseRole("app_auth_account_resolver", (client) =>
        client.query("select app.bootstrap_auth_account('wrong-executor')"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("allows the deletion executor only its function and no direct private rows", async () => {
    for (const statement of [
      "select id from user_account",
      "delete from profile",
      `delete from auth."user"`,
      "delete from authentication_email_suppression",
    ]) {
      await expect(
        asDatabaseRole("app_account_deletion", (client) =>
          client.query(statement),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      asDatabaseRole("app_auth_account_resolver", (client) =>
        client.query(
          `select app.erase_local_auth_account(
             'wrong', 'wrong', '11111111-1111-4111-8111-111111111111')`,
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cascades sessions and password accounts when an auth user is deleted", async () => {
    await pool.query(
      `insert into auth."user" (id, name, email, email_verified)
       values ('delete-auth-user', 'Delete fixture', 'delete@example.test', true);
       insert into auth."session" (id, token, user_id, expires_at)
       values ('delete-auth-session', 'delete-auth-token', 'delete-auth-user',
         CURRENT_TIMESTAMP + interval '1 hour');
       insert into auth."account"
         (id, account_id, provider_id, user_id, password)
       values ('delete-auth-account', 'delete@example.test', 'credential',
         'delete-auth-user', 'fixture-hash-not-a-real-password');
       delete from auth."user" where id = 'delete-auth-user'`,
    );
    const rows = await pool.query<{ sessions: string; accounts: string }>(
      `select
         (select count(*)::text from auth."session"
          where user_id = 'delete-auth-user') as sessions,
         (select count(*)::text from auth."account"
          where user_id = 'delete-auth-user') as accounts`,
    );
    expect(rows.rows[0]).toEqual({ sessions: "0", accounts: "0" });
  });
});

describe("verified-session account deletion lifecycle", () => {
  async function createFixture(seed: string) {
    const email = `delete-${seed}-${randomUUID()}@example.test`;
    const password = "integration-deletion-password-123";
    const signUp = await auth.api.signUpEmail({
      body: { name: "Deletion fixture", email, password },
    });
    await pool.query(
      `update auth."user" set email_verified = true where id = $1`,
      [signUp.user.id],
    );
    const signIn = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    const cookie = signIn.headers.get("set-cookie")!.split(";", 1)[0]!;
    const sessionHeaders = new Headers({
      cookie,
      origin: "https://app.example.test",
    });
    const verifier = new BetterAuthVerifiedSessionVerifier(auth.api);
    const bootstrapRequest = new Request(
      "https://app.example.test/internal/account-bootstrap",
      { method: "POST", headers: sessionHeaders },
    );
    await expect(
      bootstrapAccountForRequest(bootstrapRequest, {
        sessionVerifier: verifier,
        bootstrapper: authAccountBootstrapper,
        accountResolver: authAccountResolver,
        readinessVerifier: authAccountReadiness,
      }),
    ).resolves.toMatchObject({ disposition: "ready" });
    const account = await pool.query<{ id: string }>(
      `select id from user_account where identity_provider_subject = $1`,
      [signUp.user.id],
    );
    const sessionRequest = new Request("https://app.example.test/private", {
      headers: sessionHeaders,
    });
    const verified = await verifier.verify(sessionRequest);
    if (verified.status !== "active") throw new Error("fixture session failed");
    return {
      email,
      password,
      subject: signUp.user.id,
      ownerId: account.rows[0]!.id as AccountId,
      session: verified,
      sessionHeaders,
      verifier,
    };
  }

  async function addPrivateRows(
    fixture: Awaited<ReturnType<typeof createFixture>>,
  ) {
    const profile = await pool.query<{ id: string }>(
      `insert into profile (owner_user_id, display_name, current_timezone)
       values ($1, 'Deletion private marker', 'America/Toronto') returning id`,
      [fixture.ownerId],
    );
    const births = await pool.query<{ id: string }>(
      `insert into birth_profile (profile_id, birth_date, timezone, birth_time_precision)
       values ($1, '1990-01-01', 'America/Toronto', 'date-only'),
              ($1, '1991-01-01', 'America/Toronto', 'date-only') returning id`,
      [profile.rows[0]!.id],
    );
    await pool.query(
      `insert into calculation_run
         (owner_user_id, kind, normalized_input_hash, engine_version,
          provider_key, provider_version, config_version)
       values ($1, 'deletion-fixture', $2, '1', 'fixture', '1', '1')`,
      [fixture.ownerId, randomUUID()],
    );
    const reportId = await compatibilityRepository.create(fixture.ownerId, {
      primaryBirthProfileId: births.rows[0]!.id,
      comparisonBirthProfileId: births.rows[1]!.id,
      report: DEMO_COMPATIBILITY_REPORT,
    });
    const publication = await compatibilityRepository.publishOwned(
      fixture.ownerId,
      reportId,
      null,
    );
    await pool.query(
      `insert into audit_event
         (owner_user_id, actor_reference, resource_type, resource_reference,
          action, request_id, metadata)
       values ($1::uuid, 'deletion-fixture', 'account', ($1::uuid)::text,
               'fixture-created', $2, '{"private":"marker"}')`,
      [fixture.ownerId, randomUUID()],
    );
    await pool.query(
      `insert into auth.verification
         (id, identifier, value, expires_at)
       values ($1, $2, $3, CURRENT_TIMESTAMP + interval '1 hour')`,
      [randomUUID(), fixture.email, fixture.subject],
    );
    return { profileId: profile.rows[0]!.id, shareToken: publication!.token };
  }

  function deletionRequest(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    password = fixture.password,
  ) {
    const body = JSON.stringify({
      version: "1.0.0",
      confirmation: "DELETE MY ACCOUNT",
      currentPassword: password,
    });
    const headers = new Headers(fixture.sessionHeaders);
    headers.set("origin", "https://app.example.test");
    headers.set("sec-fetch-site", "same-origin");
    headers.set("content-type", "application/json");
    headers.set("content-length", String(Buffer.byteLength(body)));
    return new Request("https://app.example.test/internal/account-deletion", {
      method: "POST",
      headers,
      body,
    });
  }

  function deletionDependencies(
    fixture: Awaited<ReturnType<typeof createFixture>>,
  ) {
    return {
      canonicalOrigin: "https://app.example.test",
      sessionVerifier: fixture.verifier,
      accountResolver: authAccountResolver,
      passwordReauthenticator: new BetterAuthCurrentPasswordReauthenticator(
        auth.api,
      ),
      eraser: localAccountDeletion,
    };
  }

  function deletionForm(password: string) {
    const data = new FormData();
    data.append("version", "1.0.0");
    data.append("confirmation", "DELETE MY ACCOUNT");
    data.append("currentPassword", password);
    return data;
  }

  it("erases local private/auth/share state, retains safety ledgers, and flags billing reconciliation", async () => {
    const fixture = await createFixture("billing");
    const privateRows = await addPrivateRows(fixture);
    const customerReference = `customer-${randomUUID()}`;
    await pool.query(
      `insert into subscription
         (user_account_id, plan_key, status, external_provider,
          external_customer_reference, external_subscription_reference)
       values ($1, 'legacy-plan', 'active', 'deletion_test', $2, $3)`,
      [fixture.ownerId, customerReference, `subscription-${randomUUID()}`],
    );
    await pool.query(
      `insert into billing_customer_binding
         (user_account_id, external_provider, external_customer_reference)
       values ($1, 'deletion_test', $2)`,
      [fixture.ownerId, customerReference],
    );
    const safetyBefore = await pool.query<{
      feedback: string;
      suppression: string;
    }>(
      `select
         (select count(*)::text from authentication_email_feedback_receipt) as feedback,
         (select count(*)::text from authentication_email_suppression) as suppression`,
    );

    await expect(
      deleteAccountForRequest(
        deletionRequest(fixture, "wrong-password"),
        deletionDependencies(fixture),
      ),
    ).resolves.toMatchObject({
      disposition: "reject",
      code: "deletion-not-authorized",
    });
    await expect(
      deleteAccountFromForm(
        fixture.sessionHeaders,
        deletionForm(fixture.password),
        () => ({
          canonicalOrigin: "https://app.example.test",
          deleteAccount: (request) =>
            deleteAccountForRequest(request, deletionDependencies(fixture)),
        }),
      ),
    ).resolves.toEqual({ status: "reconcile" });

    const state = await pool.query<{
      deleted: boolean;
      profiles: string;
      calculations: string;
      reports: string;
      audits: string;
      auth_users: string;
      auth_sessions: string;
      auth_accounts: string;
      verifications: string;
      subscriptions: string;
      bindings: string;
      feedback: string;
      suppression: string;
    }>(
      `select
         (select deleted_at is not null from user_account where id = $1) as deleted,
         (select count(*)::text from profile where owner_user_id = $1) as profiles,
         (select count(*)::text from calculation_run where owner_user_id = $1) as calculations,
         (select count(*)::text from compatibility_report where owner_user_id = $1) as reports,
         (select count(*)::text from audit_event where owner_user_id = $1) as audits,
         (select count(*)::text from auth."user" where id = $2) as auth_users,
         (select count(*)::text from auth."session" where user_id = $2) as auth_sessions,
         (select count(*)::text from auth.account where user_id = $2) as auth_accounts,
         (select count(*)::text from auth.verification
            where identifier = $3 or value = $2) as verifications,
         (select count(*)::text from subscription where user_account_id = $1) as subscriptions,
         (select count(*)::text from billing_customer_binding where user_account_id = $1) as bindings,
         (select count(*)::text from authentication_email_feedback_receipt) as feedback,
         (select count(*)::text from authentication_email_suppression) as suppression`,
      [fixture.ownerId, fixture.subject, fixture.email],
    );
    expect(state.rows[0]).toEqual({
      deleted: true,
      profiles: "0",
      calculations: "0",
      reports: "0",
      audits: "0",
      auth_users: "0",
      auth_sessions: "0",
      auth_accounts: "0",
      verifications: "0",
      subscriptions: "1",
      bindings: "1",
      feedback: safetyBefore.rows[0]!.feedback,
      suppression: safetyBefore.rows[0]!.suppression,
    });
    await expect(
      compatibilityRepository.resolveActivePublic(privateRows.shareToken),
    ).resolves.toBeNull();
    await expect(bootstrapAccount(pool, fixture.session)).rejects.toEqual(
      new AccountUnavailableError(),
    );

    await pool.query("delete from subscription where user_account_id = $1", [
      fixture.ownerId,
    ]);
    await pool.query(
      "delete from billing_customer_binding where user_account_id = $1",
      [fixture.ownerId],
    );
    await pool.query("delete from user_account where id = $1", [
      fixture.ownerId,
    ]);
  });

  it("serializes replay, deletes one account only, and returns completed without billing", async () => {
    const first = await createFixture("concurrent-a");
    const second = await createFixture("concurrent-b");
    await addPrivateRows(first);
    const secondRows = await addPrivateRows(second);
    const outcomes = await Promise.all([
      localAccountDeletion.erase(first.session, first.ownerId),
      localAccountDeletion.erase(first.session, first.ownerId),
      localAccountDeletion.erase(first.session, first.ownerId),
    ]);
    expect(outcomes).toEqual(["deleted", "deleted", "deleted"]);
    const isolation = await pool.query<{
      first_deleted: boolean;
      first_profiles: string;
      second_deleted: boolean;
      second_profiles: string;
      second_auth: string;
    }>(
      `select
         (select deleted_at is not null from user_account where id = $1) as first_deleted,
         (select count(*)::text from profile where owner_user_id = $1) as first_profiles,
         (select deleted_at is not null from user_account where id = $2) as second_deleted,
         (select count(*)::text from profile where owner_user_id = $2) as second_profiles,
         (select count(*)::text from auth."user" where id = $3) as second_auth`,
      [first.ownerId, second.ownerId, second.subject],
    );
    expect(isolation.rows[0]).toEqual({
      first_deleted: true,
      first_profiles: "0",
      second_deleted: false,
      second_profiles: "1",
      second_auth: "1",
    });
    await expect(
      compatibilityRepository.resolveActivePublic(secondRows.shareToken),
    ).resolves.not.toBeNull();
    await pool.query(`delete from auth."user" where id = $1`, [second.subject]);
    await pool.query("delete from user_account where id in ($1, $2)", [
      first.ownerId,
      second.ownerId,
    ]);
  });

  it("uses the subject, erasure, and retained-billing indexes", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local enable_seqscan = off");
      const planRows: unknown[] = [];
      for (const query of [
        "explain (format json) select id from user_account where identity_provider_subject = 'index-probe'",
        "explain (format json) select id from profile where owner_user_id = '00000000-0000-4000-8000-000000000001'",
        "explain (format json) select id from calculation_run where owner_user_id = '00000000-0000-4000-8000-000000000001'",
        "explain (format json) select id from audit_event where owner_user_id = '00000000-0000-4000-8000-000000000001'",
        "explain (format json) select id from subscription where user_account_id = '00000000-0000-4000-8000-000000000001'",
        "explain (format json) select id from billing_customer_binding where user_account_id = '00000000-0000-4000-8000-000000000001'",
      ]) {
        const result = await client.query(query);
        planRows.push(...result.rows);
      }
      const plan = JSON.stringify(planRows);
      expect(plan).toContain("user_account_identity_subject_uidx");
      expect(plan).toContain("profile_owner_idx");
      expect(plan).toContain("calculation_run_owner_idx");
      expect(plan).toContain("audit_event_owner_occurred_idx");
      expect(plan).toContain("subscription_user_idx");
      expect(plan).toContain("billing_customer_binding_owner_idx");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("rolls every local erasure back on an internal failure and restores pooled authority", async () => {
    const fixture = await createFixture("rollback");
    await addPrivateRows(fixture);
    await pool.query(
      `create function public.fail_account_deletion_fixture() returns trigger
       language plpgsql as $$ begin raise exception 'deliberate deletion rollback'; end $$;
       create trigger fail_account_deletion_fixture
       before delete on calculation_run for each statement
       execute function public.fail_account_deletion_fixture()`,
    );
    try {
      await expect(
        localAccountDeletion.erase(fixture.session, fixture.ownerId),
      ).rejects.toThrow("deliberate deletion rollback");
    } finally {
      await pool.query(
        `drop trigger if exists fail_account_deletion_fixture on calculation_run;
         drop function if exists public.fail_account_deletion_fixture()`,
      );
    }
    const state = await pool.query<{
      deleted: boolean;
      profiles: string;
      auth_users: string;
      current_role: string;
      current_user: string;
    }>(
      `select
         (select deleted_at is not null from user_account where id = $1) as deleted,
         (select count(*)::text from profile where owner_user_id = $1) as profiles,
         (select count(*)::text from auth."user" where id = $2) as auth_users,
         current_role, current_user`,
      [fixture.ownerId, fixture.subject],
    );
    expect(state.rows[0]).toEqual({
      deleted: false,
      profiles: "1",
      auth_users: "1",
      current_role: "cosmic",
      current_user: "cosmic",
    });
    await pool.query(`delete from auth."user" where id = $1`, [
      fixture.subject,
    ]);
    await pool.query("delete from user_account where id = $1", [
      fixture.ownerId,
    ]);
  });
});

async function asDatabaseRole<T>(
  role:
    | "app_user"
    | "app_auth_runtime"
    | "app_auth_account_resolver"
    | "app_auth_account_bootstrap"
    | "app_account_deletion"
    | "app_auth_contact_resolver",
  work: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
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

describe("billing customer ownership binding", () => {
  const identity = {
    provider: "binding_test",
    customerReference: "customer_owner_a",
  } as const;

  it("creates an immutable owner binding idempotently and resolves only active owners", async () => {
    const created = await billingBindingRepository.bind(
      ownerA as AccountId,
      identity,
    );
    expect(created).toEqual({ outcome: "created", identity });
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.identity)).toBe(true);

    await expect(
      billingBindingRepository.bind(ownerA as AccountId, identity),
    ).resolves.toEqual({ outcome: "existing", identity });
    await expect(
      billingBindingRepository.findForProvider(
        ownerA as AccountId,
        identity.provider,
      ),
    ).resolves.toEqual(identity);
    await expect(
      billingBindingRepository.findForProvider(
        ownerB as AccountId,
        identity.provider,
      ),
    ).resolves.toBeNull();
    await expect(
      billingOwnerResolver.resolveOwner(
        identity.provider,
        identity.customerReference,
      ),
    ).resolves.toBe(ownerA);
    await expect(
      billingOwnerResolver.resolveOwner(identity.provider, "customer_unknown"),
    ).resolves.toBeNull();
  });

  it("serializes concurrent first binding and rejects every ownership collision", async () => {
    const concurrentIdentity = {
      provider: "binding_concurrent",
      customerReference: "customer_concurrent",
    } as const;
    const outcomes = await Promise.all([
      billingBindingRepository.bind(ownerA as AccountId, concurrentIdentity),
      billingBindingRepository.bind(ownerA as AccountId, concurrentIdentity),
    ]);
    expect(outcomes.map((value) => value.outcome).sort()).toEqual([
      "created",
      "existing",
    ]);

    await expect(
      billingBindingRepository.bind(ownerA as AccountId, {
        ...concurrentIdentity,
        customerReference: "customer_replacement",
      }),
    ).rejects.toEqual(new BillingCustomerBindingConflictError());
    await expect(
      billingBindingRepository.bind(ownerB as AccountId, concurrentIdentity),
    ).rejects.toEqual(new BillingCustomerBindingConflictError());

    const stored = await pool.query<{ bindings: string }>(
      `select count(*)::text as bindings
       from billing_customer_binding
       where external_provider = $1`,
      [concurrentIdentity.provider],
    );
    expect(stored.rows[0]).toEqual({ bindings: "1" });
  });

  it("rejects browser fields, unsafe references, and cross-owner writes", async () => {
    await expect(
      billingBindingRepository.bind(ownerA as AccountId, {
        ...identity,
        email: "browser@example.test",
      }),
    ).rejects.toThrow("Billing customer identity is invalid");
    await expect(
      billingBindingRepository.bind(ownerA as AccountId, {
        provider: "Paddle",
        customerReference: "ctm_valid",
      }),
    ).rejects.toThrow("Billing customer identity is invalid");
    await expect(
      billingBindingRepository.findForProvider(
        ownerA as AccountId,
        "contains space",
      ),
    ).rejects.toThrow("Billing provider identity is invalid");

    await expect(
      asUser(ownerA, (client) =>
        client.query(
          `insert into billing_customer_binding
             (user_account_id, external_provider, external_customer_reference)
           values ($1, 'binding_forbidden', 'customer_forbidden')`,
          [ownerB],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(ownerA, (client) =>
        client.query(
          `insert into billing_customer_binding
             (user_account_id, external_provider, external_customer_reference)
           values ($1, 'Invalid Provider', 'customer')`,
          [ownerA],
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces forced RLS, immutable app access, and function-only resolver privilege", async () => {
    const boundary = await pool.query<{
      forced: boolean;
      app_select: boolean;
      app_insert: boolean;
      app_update: boolean;
      app_delete: boolean;
      resolver_select: boolean;
      resolver_execute: boolean;
      app_execute: boolean;
      resolver_login: boolean;
      resolver_owner_login: boolean;
      resolver_inherits_owner: boolean;
      function_owner: string;
    }>(
      `select c.relforcerowsecurity as forced,
              has_table_privilege('app_user', c.oid, 'SELECT') as app_select,
              has_table_privilege('app_user', c.oid, 'INSERT') as app_insert,
              has_table_privilege('app_user', c.oid, 'UPDATE') as app_update,
              has_table_privilege('app_user', c.oid, 'DELETE') as app_delete,
              has_table_privilege('app_billing_resolver', c.oid, 'SELECT')
                as resolver_select,
              has_function_privilege(
                'app_billing_resolver',
                'app.resolve_billing_customer_owner(text,text)',
                'EXECUTE'
              ) as resolver_execute,
              has_function_privilege(
                'app_user',
                'app.resolve_billing_customer_owner(text,text)',
                'EXECUTE'
              ) as app_execute,
              (select rolcanlogin from pg_roles
               where rolname = 'app_billing_resolver') as resolver_login,
              (select rolcanlogin from pg_roles
               where rolname = 'app_billing_resolver_owner')
                as resolver_owner_login,
              pg_has_role(
                'app_billing_resolver',
                'app_billing_resolver_owner',
                'MEMBER'
              ) as resolver_inherits_owner,
              (select pg_get_userbyid(p.proowner)
               from pg_proc p join pg_namespace pn on pn.oid = p.pronamespace
               where pn.nspname = 'app'
                 and p.proname = 'resolve_billing_customer_owner')
                as function_owner
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'billing_customer_binding'`,
    );
    expect(boundary.rows[0]).toEqual({
      forced: true,
      app_select: true,
      app_insert: true,
      app_update: false,
      app_delete: false,
      resolver_select: false,
      resolver_execute: true,
      app_execute: false,
      resolver_login: false,
      resolver_owner_login: false,
      resolver_inherits_owner: false,
      function_owner: "app_billing_resolver_owner",
    });

    await expect(
      asUser(ownerA, (client) =>
        client.query(
          "update billing_customer_binding set external_customer_reference = 'changed'",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(ownerA, (client) =>
        client.query("delete from billing_customer_binding"),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    const resolverClient = await pool.connect();
    try {
      await resolverClient.query("begin");
      await resolverClient.query("set local role app_billing_resolver");
      await expect(
        resolverClient.query("select * from billing_customer_binding"),
      ).rejects.toMatchObject({ code: "42501" });
      await resolverClient.query("rollback");
    } finally {
      resolverClient.release();
    }

    const noIdentity = await asUser(null, (client) =>
      client.query("select id from billing_customer_binding"),
    );
    expect(noIdentity.rowCount).toBe(0);

    const plan = await asUser(ownerA, async (client) => {
      await client.query("set local enable_seqscan = off");
      return client.query(
        `explain (format json)
         select external_customer_reference
         from billing_customer_binding
         where external_provider = 'binding_test'`,
      );
    });
    expect(JSON.stringify(plan.rows)).toContain(
      "billing_customer_binding_owner_provider_uidx",
    );
  });

  it("returns no owner after soft deletion and cascades on hard deletion", async () => {
    const temporaryOwner = randomUUID();
    await pool.query(
      `insert into user_account (id, identity_provider_subject)
       values ($1, 'billing-binding-temporary-owner')`,
      [temporaryOwner],
    );
    const temporaryIdentity = {
      provider: "binding_temporary",
      customerReference: "customer_temporary",
    } as const;
    await billingBindingRepository.bind(
      temporaryOwner as AccountId,
      temporaryIdentity,
    );
    await pool.query(
      "update user_account set deleted_at = now() where id = $1",
      [temporaryOwner],
    );
    await expect(
      billingOwnerResolver.resolveOwner(
        temporaryIdentity.provider,
        temporaryIdentity.customerReference,
      ),
    ).resolves.toBeNull();
    await pool.query("delete from user_account where id = $1", [
      temporaryOwner,
    ]);
    const remaining = await pool.query<{ count: string }>(
      `select count(*)::text as count from billing_customer_binding
       where user_account_id = $1`,
      [temporaryOwner],
    );
    expect(remaining.rows[0]).toEqual({ count: "0" });
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

describe("authentication email privacy-minimized idempotency ledger", () => {
  const reference = (seed: string) =>
    createHash("sha256").update(seed).digest("base64url");

  it("atomically reserves once and returns in-progress for concurrent exact replay", async () => {
    authEmailNow = new Date("2026-08-12T12:00:00.000Z");
    const request = authEmailRequest(reference("concurrent-reservation"));
    const results = await Promise.all([
      authEmailIdempotency.reserve(request),
      authEmailIdempotency.reserve(request),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      "in-progress",
      "reserved",
    ]);
  });

  it("binds one accepted provider reference and makes later completion idempotent", async () => {
    const request = authEmailRequest(reference("accepted-delivery"));
    await expect(authEmailIdempotency.reserve(request)).resolves.toMatchObject({
      outcome: "reserved",
    });
    await expect(
      authEmailIdempotency.complete(
        request,
        {
          version: "1.0.0",
          disposition: "accepted",
          code: "EMAIL_ACCEPTED",
        },
        "ses-message-001",
      ),
    ).resolves.toEqual({ version: "1.0.0", outcome: "accepted" });
    await expect(
      authEmailIdempotency.complete(request, {
        version: "1.0.0",
        disposition: "retry",
        code: "EMAIL_RETRY",
      }),
    ).resolves.toEqual({ version: "1.0.0", outcome: "accepted" });
  });

  it("detects content collision without revealing either request", async () => {
    const idempotencyReference = reference("collision");
    await authEmailIdempotency.reserve(
      authEmailRequest(idempotencyReference, "first@example.test"),
    );
    await expect(
      authEmailIdempotency.reserve(
        authEmailRequest(idempotencyReference, "second@example.test"),
      ),
    ).resolves.toEqual({ version: "1.0.0", outcome: "collision" });
  });

  it("finds an existing reservation through a retained rollover key", async () => {
    const request = authEmailRequest(reference("rollover-replay"));
    await authEmailIdempotency.reserve(request);
    const nextKey = createHash("sha256")
      .update("database-auth-email-key-next")
      .digest("base64url");
    const rotated = new AuthenticationEmailIdempotencyRepository(
      pool,
      {
        keys: [
          { version: 2, value: nextKey },
          { version: 1, value: authEmailKey },
        ],
        leaseMilliseconds: 60_000,
      },
      "https://app.example.test",
      () => authEmailNow,
    );
    await expect(rotated.reserve(request)).resolves.toEqual({
      version: "1.0.0",
      outcome: "in-progress",
    });
  });

  it("rejects invalid terminal/provider-reference combinations before SQL", async () => {
    const request = authEmailRequest(reference("invalid-completion"));
    await authEmailIdempotency.reserve(request);
    await expect(
      authEmailIdempotency.complete(request, {
        version: "1.0.0",
        disposition: "accepted",
        code: "EMAIL_ACCEPTED",
      }),
    ).rejects.toThrow("Authentication email configuration is unavailable");
    await expect(
      authEmailIdempotency.complete(
        request,
        {
          version: "1.0.0",
          disposition: "suppressed",
          code: "EMAIL_SUPPRESSED",
        },
        "provider-reference-not-allowed",
      ),
    ).rejects.toThrow("Authentication email configuration is unavailable");
  });

  it("moves an abandoned reservation to reconciliation-required and never reopens it", async () => {
    authEmailNow = new Date("2026-08-12T13:00:00.000Z");
    const request = authEmailRequest(reference("abandoned"));
    await authEmailIdempotency.reserve(request);
    authEmailNow = new Date("2026-08-12T13:01:00.001Z");
    await expect(authEmailIdempotency.reserve(request)).resolves.toEqual({
      version: "1.0.0",
      outcome: "reconciliation-required",
    });
    await expect(
      authEmailIdempotency.complete(
        request,
        {
          version: "1.0.0",
          disposition: "accepted",
          code: "EMAIL_ACCEPTED",
        },
        "late-provider-message",
      ),
    ).resolves.toEqual({
      version: "1.0.0",
      outcome: "reconciliation-required",
    });
  });

  it("persists no recipient, capability URL/token, rendered body, or raw reference", async () => {
    const rawReference = reference("privacy-scan");
    const request = authEmailRequest(rawReference, "private@example.test");
    await authEmailIdempotency.reserve(request);
    const rows = await pool.query<Record<string, unknown>>(
      `select * from authentication_email_delivery
       where purpose = 'verify-email'`,
    );
    const serialized = JSON.stringify(rows.rows);
    expect(serialized).not.toContain("private@example.test");
    expect(serialized).not.toContain("header.payload.signature");
    expect(serialized).not.toContain("callbackURL");
    expect(serialized).not.toContain(rawReference);
    expect(serialized).not.toContain("<html");
    expect(serialized).toMatch(/hmac-sha256:1:[0-9a-f]{64}/);
  });

  it("denies app-user reads and runtime deletion while using the recovery index", async () => {
    await expect(
      asUser(ownerA, (client) =>
        client.query("select id from authentication_email_delivery"),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role app_auth_email_runtime");
      await expect(
        client.query("delete from authentication_email_delivery"),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback");
    } finally {
      client.release();
    }

    const planClient = await pool.connect();
    let planRows: unknown = null;
    try {
      await planClient.query("begin");
      await planClient.query("set local enable_seqscan = off");
      const plan = await planClient.query(
        `explain (format json)
         select id from authentication_email_delivery
         where state = 'reserved' and lease_expires_at <= CURRENT_TIMESTAMP`,
      );
      planRows = plan.rows;
      await planClient.query("rollback");
    } finally {
      planClient.release();
    }
    expect(JSON.stringify(planRows)).toContain(
      "authentication_email_delivery_recovery_idx",
    );
  });
});

describe("authentication email feedback and suppression ledger", () => {
  const reference = (seed: string) =>
    createHash("sha256").update(`feedback:${seed}`).digest("base64url");
  const event = (
    providerMessageReference: string,
    type:
      | "delivery"
      | "bounce"
      | "complaint"
      | "reject"
      | "delay"
      | "render-failure",
    recipient: string,
    overrides: Record<string, unknown> = {},
  ) =>
    ({
      version: "1.0.0",
      eventId: randomUUID(),
      providerMessageReference,
      type,
      occurredAt: new Date("2026-08-12T13:59:00.000Z"),
      recipient,
      permanent: type === "complaint",
      ...overrides,
    }) as never;

  async function acceptedDelivery(
    seed: string,
    providerMessageReference: string,
    recipient: string,
  ) {
    authEmailNow = new Date("2026-08-12T13:30:00.000Z");
    const request = authEmailRequest(reference(seed), recipient);
    await authEmailIdempotency.reserve(request);
    await authEmailIdempotency.complete(
      request,
      {
        version: "1.0.0",
        disposition: "accepted",
        code: "EMAIL_ACCEPTED",
      },
      providerMessageReference,
    );
  }

  it("deduplicates concurrent permanent bounce feedback and suppresses exactly once", async () => {
    const recipient = "feedback-bounce@example.test";
    const providerReference = "ses-feedback-bounce-001";
    await acceptedDelivery("permanent-bounce", providerReference, recipient);
    const feedback = event(providerReference, "bounce", recipient, {
      permanent: true,
    });
    const outcomes = await Promise.all([
      authEmailFeedback.process(feedback),
      authEmailFeedback.process(feedback),
    ]);
    expect(outcomes.sort()).toEqual(["applied", "duplicate"]);
    await expect(authEmailFeedback.isSuppressed(recipient)).resolves.toBe(true);
    const stored = await pool.query<{
      state: string;
      receipts: string;
      suppressions: string;
    }>(
      `select d.state,
              (select count(*) from authentication_email_feedback_receipt
               where delivery_id = d.id)::text as receipts,
              (select count(*) from authentication_email_suppression)::text
                as suppressions
       from authentication_email_delivery d
       where d.provider_message_reference = $1`,
      [providerReference],
    );
    expect(stored.rows[0]).toMatchObject({
      state: "permanent-bounce",
      receipts: "1",
    });
    expect(Number(stored.rows[0]!.suppressions)).toBeGreaterThan(0);
  });

  it("keeps suppression and terminal state across duplicate and out-of-order events", async () => {
    const recipient = "feedback-order@example.test";
    const providerReference = "ses-feedback-order-001";
    await acceptedDelivery("out-of-order", providerReference, recipient);
    const complaint = event(providerReference, "complaint", recipient);
    await expect(authEmailFeedback.process(complaint)).resolves.toBe("applied");
    await expect(
      authEmailFeedback.process(
        event(providerReference, "delivery", recipient, {
          occurredAt: new Date("2026-08-12T13:58:00.000Z"),
        }),
      ),
    ).resolves.toBe("stale");
    await expect(
      authEmailFeedback.process(
        event(providerReference, "delay", recipient, {
          occurredAt: new Date("2026-08-12T13:57:00.000Z"),
        }),
      ),
    ).resolves.toBe("stale");
    const state = await pool.query<{ state: string }>(
      `select state from authentication_email_delivery
       where provider_message_reference = $1`,
      [providerReference],
    );
    expect(state.rows[0]!.state).toBe("complaint");
    await expect(authEmailFeedback.isSuppressed(recipient)).resolves.toBe(true);
  });

  it("tracks transient bounce then delivery without suppressing the recipient", async () => {
    const recipient = "feedback-transient@example.test";
    const providerReference = "ses-feedback-transient-001";
    await acceptedDelivery("transient-bounce", providerReference, recipient);
    await expect(
      authEmailFeedback.process(
        event(providerReference, "bounce", recipient, { permanent: false }),
      ),
    ).resolves.toBe("applied");
    await expect(authEmailFeedback.isSuppressed(recipient)).resolves.toBe(
      false,
    );
    await expect(
      authEmailFeedback.process(
        event(providerReference, "delivery", recipient),
      ),
    ).resolves.toBe("applied");
    const state = await pool.query<{ state: string }>(
      `select state from authentication_email_delivery
       where provider_message_reference = $1`,
      [providerReference],
    );
    expect(state.rows[0]!.state).toBe("delivered");
  });

  it("keeps two recipients unlinkable and suppresses only the authenticated recipient", async () => {
    const first = "feedback-private-a@example.test";
    const second = "feedback-private-b@example.test";
    await acceptedDelivery("privacy-a", "ses-feedback-private-a", first);
    await acceptedDelivery("privacy-b", "ses-feedback-private-b", second);
    await authEmailFeedback.process(
      event("ses-feedback-private-b", "bounce", second, { permanent: true }),
    );
    await expect(authEmailFeedback.isSuppressed(first)).resolves.toBe(false);
    await expect(authEmailFeedback.isSuppressed(second)).resolves.toBe(true);
    const receipts = await pool.query(
      "select * from authentication_email_feedback_receipt",
    );
    const suppressions = await pool.query(
      "select * from authentication_email_suppression",
    );
    const serialized = JSON.stringify([receipts.rows, suppressions.rows]);
    expect(serialized).not.toContain(first);
    expect(serialized).not.toContain(second);
    expect(serialized).not.toContain("ses-feedback-private-b");
    expect(serialized).toMatch(/hmac-sha256:1:[0-9a-f]{64}/);
  });

  it("records unmatched feedback without provider identity and deduplicates it", async () => {
    const feedback = event(
      "ses-feedback-does-not-exist",
      "delivery",
      "unmatched@example.test",
    );
    await expect(authEmailFeedback.process(feedback)).resolves.toBe(
      "unmatched",
    );
    await expect(authEmailFeedback.process(feedback)).resolves.toBe(
      "duplicate",
    );
    const receipt = await pool.query<Record<string, unknown>>(
      `select * from authentication_email_feedback_receipt
       where outcome = 'unmatched' order by received_at desc limit 1`,
    );
    expect(receipt.rows[0]!.delivery_id).toBeNull();
    expect(JSON.stringify(receipt.rows[0])).not.toContain(
      "ses-feedback-does-not-exist",
    );
    expect(JSON.stringify(receipt.rows[0])).not.toContain(
      "unmatched@example.test",
    );
  });

  it("rolls back delivery and suppression when the append-only receipt violates its timeline", async () => {
    const recipient = "feedback-rollback@example.test";
    const providerReference = "ses-feedback-rollback-001";
    await acceptedDelivery("feedback-rollback", providerReference, recipient);
    await expect(
      authEmailFeedback.process(
        event(providerReference, "complaint", recipient, {
          occurredAt: new Date("2026-08-13T14:00:00.000Z"),
        }),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const state = await pool.query<{ state: string }>(
      `select state from authentication_email_delivery
       where provider_message_reference = $1`,
      [providerReference],
    );
    expect(state.rows[0]!.state).toBe("accepted");
    await expect(authEmailFeedback.isSuppressed(recipient)).resolves.toBe(
      false,
    );
  });

  it("denies public mutation and proves consumer and retention access paths", async () => {
    await expect(
      asUser(ownerA, (client) =>
        client.query("select id from authentication_email_feedback_receipt"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const consumer = await pool.connect();
    try {
      await consumer.query("begin");
      await consumer.query("set local role app_auth_email_feedback_consumer");
      await expect(
        consumer.query("delete from authentication_email_feedback_receipt"),
      ).rejects.toMatchObject({ code: "42501" });
      await consumer.query("rollback");
    } finally {
      consumer.release();
    }

    const maintenance = await pool.connect();
    try {
      await maintenance.query("begin");
      await maintenance.query("set local enable_seqscan = off");
      const feedbackPlan = await maintenance.query(
        `explain (format json) delete from authentication_email_feedback_receipt
         where received_at < '2026-01-01T00:00:00Z'`,
      );
      const suppressionPlan = await maintenance.query(
        `explain (format json) select id from authentication_email_suppression
         where suppressed_at < '2026-01-01T00:00:00Z'`,
      );
      const eventPlan = await maintenance.query(
        `explain (format json) select id from authentication_email_feedback_receipt
         where event_digest = 'hmac-sha256:1:${"0".repeat(64)}'`,
      );
      const deliveryPlan = await maintenance.query(
        `explain (format json) select id from authentication_email_delivery
         where provider_message_reference = 'ses-feedback-index-probe'`,
      );
      const recipientPlan = await maintenance.query(
        `explain (format json) select id from authentication_email_suppression
         where recipient_digest = 'hmac-sha256:1:${"0".repeat(64)}'`,
      );
      expect(JSON.stringify(feedbackPlan.rows)).toContain(
        "authentication_email_feedback_retention_idx",
      );
      expect(JSON.stringify(suppressionPlan.rows)).toContain(
        "authentication_email_suppression_retention_idx",
      );
      expect(JSON.stringify(eventPlan.rows)).toContain(
        "authentication_email_feedback_event_uidx",
      );
      expect(JSON.stringify(deliveryPlan.rows)).toContain(
        "authentication_email_delivery_provider_reference_uidx",
      );
      expect(JSON.stringify(recipientPlan.rows)).toContain(
        "authentication_email_suppression_recipient_uidx",
      );
      await maintenance.query("rollback");
    } finally {
      maintenance.release();
    }
  });

  it("enforces keyed digest, event, outcome, and suppression constraints", async () => {
    await expect(
      pool.query(
        `insert into authentication_email_feedback_receipt
           (event_key_version, event_digest, event_type, outcome,
            occurred_at, received_at)
         values (1, 'raw-event-id', 'open', 'accepted', now(), now())`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        `insert into authentication_email_suppression
           (recipient_key_version, recipient_digest, reason)
         values (1, 'hmac-sha256:1:${"0".repeat(64)}', 'transient-bounce')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("protected private profile lifecycle", () => {
  const profileNow = new Date("2026-08-13T12:00:00.000Z");
  const repository = new PrivateProfileRepository(pool, () => profileNow);

  function createCommand(displayName: string) {
    return {
      version: "1.0.0",
      operation: "create",
      value: {
        displayName,
        currentTimezone: "America/Toronto",
        birthDate: "1990-01-01",
        birthTimePrecision: "exact",
        birthTimeLocal: "13:45",
        birthTimezone: "America/Toronto",
        latitude: 48.4758,
        longitude: -81.3305,
      },
    } as const;
  }

  function createForm(displayName: string) {
    const data = new FormData();
    const entries: Array<[string, string]> = [
      ["version", "1.0.0"],
      ["operation", "create"],
      ["displayName", displayName],
      ["currentTimezone", "America/Toronto"],
      ["birthDate", "1990-01-01"],
      ["birthTimePrecision", "exact"],
      ["birthTimeLocal", "13:45"],
      ["birthTimezone", "America/Toronto"],
      ["latitude", "48.475800"],
      ["longitude", "-81.330500"],
    ];
    for (const [key, value] of entries) data.append(key, value);
    return data;
  }

  async function account(subject: string) {
    const result = await pool.query<{ id: string }>(
      `insert into user_account (identity_provider_subject)
       values ($1) returning id`,
      [subject],
    );
    return result.rows[0]!.id as AccountId;
  }

  it("composes cookie-only action input through live identity-scoped persistence", async () => {
    const owner = await account(`profile-action-${randomUUID()}`);
    try {
      const active: ActiveSession = {
        status: "active",
        subject: `profile-action-subject-${randomUUID()}`,
        sessionId: `profile-action-session-${randomUUID()}`,
        authenticatedAt: profileNow,
        expiresAt: new Date("2026-08-13T13:00:00.000Z"),
      };
      const dependencies = {
        sessionVerifier: { verify: vi.fn(async () => active) },
        accountResolver: { resolveActiveAccount: vi.fn(async () => owner) },
        profiles: repository,
        now: () => profileNow,
      };
      await expect(
        mutatePrivateProfileFromForm(
          new Headers({ cookie: "session=opaque", "x-owner-id": owner }),
          createForm("Action profile"),
          () => ({
            canonicalOrigin: "https://app.example.test",
            loadPrivateProfiles: vi.fn(),
            mutatePrivateProfile: (request, command) =>
              mutatePrivateProfileForRequest(request, command, dependencies),
          }),
        ),
      ).resolves.toEqual({ status: "saved" });
      const listed = await repository.list(owner);
      expect(listed.profiles).toHaveLength(1);
      expect(listed.profiles[0]).toMatchObject({
        displayName: "Action profile",
        birthTimePrecision: "exact",
        latitude: 48.4758,
        longitude: -81.3305,
      });
    } finally {
      await pool.query("delete from user_account where id = $1", [owner]);
    }
  });

  it("enforces free concurrency limits and two-owner object authorization", async () => {
    const owner = await account(`profile-limit-${randomUUID()}`);
    const other = await account(`profile-other-${randomUUID()}`);
    try {
      const results = await Promise.allSettled([
        repository.mutate(owner, createCommand("First concurrent")),
        repository.mutate(owner, createCommand("Second concurrent")),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejection = results.find((result) => result.status === "rejected");
      expect(rejection).toMatchObject({
        reason: new PrivateProfileLimitError(),
      });
      const listed = await repository.list(owner);
      expect(listed.profiles).toHaveLength(1);
      const profile = listed.profiles[0]!;
      await expect(
        repository.mutate(other, {
          version: "1.0.0",
          operation: "update",
          profileId: profile.profileId,
          birthProfileId: profile.birthProfileId,
          revision: profile.revision,
          value: createCommand("Hostile update").value,
        }),
      ).rejects.toEqual(new PrivateProfileAuthorizationError());
      expect((await repository.list(other)).profiles).toHaveLength(0);
    } finally {
      await pool.query("delete from user_account where id in ($1, $2)", [
        owner,
        other,
      ]);
    }
  });

  it("evaluates multiple-profile entitlement server-side and protects revisions", async () => {
    const owner = await account(`profile-advanced-${randomUUID()}`);
    try {
      await repository.mutate(owner, createCommand("Primary"));
      await pool.query(
        `insert into subscription
           (user_account_id, plan_key, status, external_provider,
            external_customer_reference, external_subscription_reference,
            period_starts_at, period_ends_at, transition_state_version,
            last_provider_event_id, last_provider_event_occurred_at)
         values ($1, 'advanced', 'active', 'profile_test', $2, $3,
                 '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
                 '1.0.0', $4, '2026-08-01T00:01:00.000Z')`,
        [
          owner,
          `customer-${randomUUID()}`,
          `subscription-${randomUUID()}`,
          `event-${randomUUID()}`,
        ],
      );
      await expect(
        repository.mutate(owner, createCommand("Secondary")),
      ).resolves.toEqual({ outcome: "saved" });
      let listed = await repository.list(owner);
      expect(listed.multipleProfilesAllowed).toBe(true);
      expect(listed.profiles).toHaveLength(2);
      const profile = listed.profiles[0]!;
      const updated = {
        version: "1.0.0",
        operation: "update",
        profileId: profile.profileId,
        birthProfileId: profile.birthProfileId,
        revision: profile.revision,
        value: createCommand("Updated primary").value,
      } as const;
      await expect(repository.mutate(owner, updated)).resolves.toEqual({
        outcome: "saved",
      });
      await expect(repository.mutate(owner, updated)).rejects.toEqual(
        new PrivateProfileConflictError(),
      );
      listed = await repository.list(owner);
      const current = listed.profiles.find(
        (entry) => entry.profileId === profile.profileId,
      )!;
      expect(current).toMatchObject({
        displayName: "Updated primary",
        revision: 2,
      });
      await expect(
        repository.mutate(owner, {
          version: "1.0.0",
          operation: "delete",
          profileId: current.profileId,
          birthProfileId: current.birthProfileId,
          revision: current.revision,
        }),
      ).resolves.toEqual({ outcome: "deleted" });
      expect((await repository.list(owner)).profiles).toHaveLength(1);
    } finally {
      await pool.query("delete from user_account where id = $1", [owner]);
    }
  });

  it("enforces new storage constraints and retains the owner index plan", async () => {
    const owner = await account(`profile-constraint-${randomUUID()}`);
    try {
      await expect(
        pool.query(
          `insert into profile
             (owner_user_id, display_name, current_timezone,
              current_latitude, current_longitude)
           values ($1, '', 'America/Toronto', 48.4, null)`,
          [owner],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      const constraints = await pool.query<{ name: string }>(
        `select conname as name from pg_constraint
          where conname in (
            'profile_revision_check',
            'profile_current_coordinates_pair_check',
            'birth_profile_time_consistency_check',
            'birth_profile_coordinate_source_check'
          ) order by conname`,
      );
      expect(constraints.rows.map((row) => row.name)).toEqual([
        "birth_profile_coordinate_source_check",
        "birth_profile_time_consistency_check",
        "profile_current_coordinates_pair_check",
        "profile_revision_check",
      ]);
      const plan = await pool.query(
        `explain (format json) select id from profile where owner_user_id = $1`,
        [owner],
      );
      expect(JSON.stringify(plan.rows)).toContain("profile_owner_idx");
    } finally {
      await pool.query("delete from user_account where id = $1", [owner]);
    }
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
      billingBindings: await client.query<{ id: string }>(
        "select id from billing_customer_binding",
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
      billingBindings: await client.query<{ id: string }>(
        "select id from billing_customer_binding",
      ),
    }));

    expect(a.profiles.rows.map((row) => row.id)).toEqual([profileA]);
    expect(new Set(a.births.rows.map((row) => row.id))).toEqual(
      new Set([birthProfileA, birthProfileA2]),
    );
    expect(a.positions.rows.map((row) => row.body)).toEqual(["sun"]);
    expect(a.subscriptions.rowCount).toBe(3);
    expect(a.receipts.rowCount).toBe(8);
    expect(a.billingBindings.rowCount).toBe(2);
    expect(b.profiles.rows.map((row) => row.id)).toEqual([profileB]);
    expect(b.births.rows.map((row) => row.id)).toEqual([birthProfileB]);
    expect(b.positions.rowCount).toBe(0);
    expect(b.subscriptions.rowCount).toBe(0);
    expect(b.receipts.rowCount).toBe(0);
    expect(b.billingBindings.rowCount).toBe(0);
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
    const [first, second, third] = await Promise.all([
      bootstrapAccount(pool, session),
      bootstrapAccount(pool, session),
      bootstrapAccount(pool, session),
    ]);
    expect(new Set([first, second, third])).toEqual(new Set([first]));

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
      billing_customer_bindings: string;
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
           where s.user_account_id = $1)::text as subscription_receipts,
         (select count(*) from billing_customer_binding
           where user_account_id = $1)::text as billing_customer_bindings`,
      [ownerA, calculationRunA],
    );
    expect(counts.rows[0]).toEqual({
      profiles: "0",
      runs: "0",
      positions: "0",
      compatibility_reports: "0",
      subscriptions: "0",
      subscription_receipts: "0",
      billing_customer_bindings: "0",
    });
  });
});
