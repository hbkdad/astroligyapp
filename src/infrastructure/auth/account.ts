import type { Pool, PoolClient } from "pg";

import type { ActiveSession } from "./session";

declare const accountIdBrand: unique symbol;
export type AccountId = string & { readonly [accountIdBrand]: true };

export class AccountUnavailableError extends Error {
  readonly code = "ACCOUNT_UNAVAILABLE";

  constructor() {
    super("The account is unavailable");
    this.name = "AccountUnavailableError";
  }
}

export async function resolveActiveAccountId(
  pool: Pick<Pool, "query">,
  session: ActiveSession,
): Promise<AccountId> {
  const result = await pool.query<{ id: string }>(
    `select id
     from user_account
     where identity_provider_subject = $1 and deleted_at is null`,
    [session.subject],
  );

  const accountId = result.rows[0]?.id;
  if (!accountId) {
    throw new AccountUnavailableError();
  }

  return accountId as AccountId;
}

export async function bootstrapAccount(
  pool: Pick<Pool, "connect">,
  session: ActiveSession,
): Promise<AccountId> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role app_auth_account_bootstrap");
    const result = await client.query<{ id: unknown }>(
      "select app.bootstrap_auth_account($1) as id",
      [session.subject],
    );
    await client.query("commit");
    const accountId = result.rows[0]?.id;
    if (!isUuid(accountId)) throw new AccountUnavailableError();
    return accountId as AccountId;
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release();
  }
}

export type LocalAccountDeletionOutcome =
  "deleted" | "reconciliation-required" | "unavailable";

export class LocalAccountDeletionRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async erase(
    session: ActiveSession,
    ownerId: AccountId,
  ): Promise<LocalAccountDeletionOutcome> {
    if (!isUuid(ownerId)) throw new AccountUnavailableError();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role app_account_deletion");
      const result = await client.query<{ outcome: unknown }>(
        `select app.erase_local_auth_account($1, $2, $3) as outcome`,
        [session.subject, session.sessionId, ownerId],
      );
      const outcome = result.rows[0]?.outcome;
      if (
        outcome !== "deleted" &&
        outcome !== "reconciliation-required" &&
        outcome !== "unavailable"
      )
        throw new AccountUnavailableError();
      await client.query("commit");
      return outcome;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function rollback(client: PoolClient) {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the first failure and discard the pooled connection below.
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
