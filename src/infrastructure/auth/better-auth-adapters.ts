import "server-only";

import type { Pool, PoolClient } from "pg";

import type {
  ActiveBillingAccountResolver,
  TrustedBillingContactResolver,
} from "@/server/authenticated-billing-customer-provisioning";
import type { TrustedBillingContact } from "@/server/billing-customer-provisioning";

import {
  AccountUnavailableError,
  bootstrapAccount,
  type AccountId,
} from "./account";
import { withIdentityTransaction } from "../persistence/identity-transaction";
import type {
  ActiveSession,
  SessionVerification,
  SessionVerifier,
} from "./session";

const TEN_MINUTES_MS = 10 * 60 * 1000;

interface BetterAuthSessionValue {
  readonly id?: unknown;
  readonly userId?: unknown;
  readonly createdAt?: unknown;
  readonly expiresAt?: unknown;
}

interface BetterAuthUserValue {
  readonly id?: unknown;
  readonly emailVerified?: unknown;
}

export interface BetterAuthSessionApi {
  getSession(input: Readonly<{ headers: Headers }>): Promise<unknown>;
}

export interface BetterAuthPasswordApi {
  verifyPassword(
    input: Readonly<{
      headers: Headers;
      body: Readonly<{ password: string }>;
    }>,
  ): Promise<unknown>;
}

export class BetterAuthBillingSessionVerifier implements SessionVerifier {
  constructor(
    private readonly api: BetterAuthSessionApi,
    private readonly now: () => Date = () => new Date(),
    private readonly requireVerifiedEmail = false,
  ) {}

  async verify(request: Request): Promise<SessionVerification> {
    const value = await this.api.getSession({
      headers: new Headers(request.headers),
    });
    if (value === null || value === undefined)
      return Object.freeze({ status: "unauthenticated" });
    if (!record(value) || !record(value.session) || !record(value.user))
      return Object.freeze({ status: "invalid" });

    return this.verifyActive(value.session, value.user);
  }

  private verifyActive(
    session: BetterAuthSessionValue,
    user: BetterAuthUserValue,
  ): SessionVerification {
    const sessionId = boundedText(session.id);
    const subject = boundedText(session.userId);
    const userId = boundedText(user.id);
    const authenticatedAt = dateValue(session.createdAt);
    const expiresAt = dateValue(session.expiresAt);
    if (
      !sessionId ||
      !subject ||
      subject !== userId ||
      (this.requireVerifiedEmail && user.emailVerified !== true) ||
      !authenticatedAt ||
      !expiresAt
    )
      return Object.freeze({ status: "invalid" });

    const now = this.now().getTime();
    if (!Number.isFinite(now)) return Object.freeze({ status: "invalid" });
    if (expiresAt.getTime() <= now) return Object.freeze({ status: "expired" });
    if (
      authenticatedAt.getTime() > now ||
      authenticatedAt.getTime() < now - TEN_MINUTES_MS
    )
      return Object.freeze({ status: "invalid" });

    return Object.freeze({
      status: "active",
      subject,
      sessionId,
      authenticatedAt,
      expiresAt,
    });
  }
}

export class BetterAuthVerifiedSessionVerifier extends BetterAuthBillingSessionVerifier {
  constructor(api: BetterAuthSessionApi, now: () => Date = () => new Date()) {
    super(api, now, true);
  }
}

export class BetterAuthAccountBootstrapper {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async bootstrap(session: ActiveSession): Promise<AccountId> {
    return bootstrapAccount(this.pool, session);
  }
}

export class IdentityScopedAccountReadinessVerifier {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async verify(ownerId: AccountId): Promise<boolean> {
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const result = await client.query<{ id: unknown }>(
        "select app.current_user_id() as id",
      );
      return result.rows[0]?.id === ownerId;
    });
  }
}

export class BetterAuthCurrentPasswordReauthenticator {
  constructor(private readonly api: BetterAuthPasswordApi) {}

  async verify(request: Request, currentPassword: string): Promise<boolean> {
    try {
      const value = await this.api.verifyPassword({
        headers: new Headers(request.headers),
        body: { password: currentPassword },
      });
      if (!record(value) || Object.keys(value).length !== 1)
        throw new AccountUnavailableError();
      return value.status === true;
    } catch (error) {
      if (
        record(error) &&
        record(error.body) &&
        error.body.code === "INVALID_PASSWORD"
      )
        return false;
      throw error;
    }
  }
}

export class BetterAuthActiveBillingAccountResolver implements ActiveBillingAccountResolver {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async resolveActiveAccount(session: ActiveSession): Promise<AccountId> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role app_auth_account_resolver");
      const result = await client.query<{ id: unknown }>(
        `select app.resolve_active_auth_account($1) as id`,
        [session.subject],
      );
      await client.query("commit");
      const id = result.rows[0]?.id;
      if (!uuid(id)) throw new AccountUnavailableError();
      return id as AccountId;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

export class BetterAuthTrustedBillingContactResolver implements TrustedBillingContactResolver {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async resolveTrustedContact(
    session: ActiveSession,
    ownerId: AccountId,
  ): Promise<TrustedBillingContact | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role app_auth_contact_resolver");
      const result = await client.query<{ email: unknown }>(
        `select app.resolve_verified_auth_contact($1, $2, $3) as email`,
        [session.subject, session.sessionId, ownerId],
      );
      await client.query("commit");
      const email = result.rows[0]?.email;
      return validEmail(email)
        ? Object.freeze({ email: email.toLowerCase() })
        : null;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the original failure; releasing destroys an unusable connection.
  }
}

function boundedText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    ? value
    : null;
}

function dateValue(value: unknown): Date | null {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function validEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(
      value,
    )
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
