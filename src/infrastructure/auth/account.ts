import type { Pool } from "pg";

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
  pool: Pick<Pool, "query">,
  session: ActiveSession,
): Promise<AccountId> {
  const result = await pool.query<{ id: string }>(
    `insert into user_account (identity_provider_subject)
     values ($1)
     on conflict (identity_provider_subject) do update
       set updated_at = now()
       where user_account.deleted_at is null
     returning id`,
    [session.subject],
  );

  const accountId = result.rows[0]?.id;
  if (!accountId) {
    throw new AccountUnavailableError();
  }

  return accountId as AccountId;
}
