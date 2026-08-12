import "server-only";

import type { Pool, PoolClient } from "pg";

import type { AccountId } from "@/infrastructure/auth/account";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import type { BillingAccountResolver } from "@/server/billing-webhook-contracts";

export interface BillingCustomerIdentity {
  readonly provider: string;
  readonly customerReference: string;
}

export interface BillingCustomerBindingResult {
  readonly outcome: "created" | "existing";
  readonly identity: BillingCustomerIdentity;
}

interface BindingRow {
  external_provider: string;
  external_customer_reference: string;
}

interface ResolverRow {
  owner_id: string | null;
}

export class BillingCustomerBindingConflictError extends Error {
  constructor() {
    super("Billing customer identity conflicts with existing ownership");
    this.name = "BillingCustomerBindingConflictError";
  }
}

export class BillingCustomerBindingRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async bind(
    ownerId: AccountId,
    identityValue: unknown,
  ): Promise<BillingCustomerBindingResult> {
    const identity = validateIdentity(identityValue);
    try {
      return await withIdentityTransaction(
        this.pool,
        ownerId,
        async ({ client }) => {
          const inserted = await client.query<BindingRow>(
            `insert into billing_customer_binding
               (user_account_id, external_provider, external_customer_reference)
             values ($1, $2, $3)
             on conflict do nothing
             returning external_provider, external_customer_reference`,
            [ownerId, identity.provider, identity.customerReference],
          );
          if (inserted.rowCount === 1)
            return result("created", identityFromRow(inserted.rows[0]!));
          if (inserted.rowCount !== 0)
            throw new TypeError("Billing customer binding result is invalid");

          const selected = await client.query<BindingRow>(
            `select external_provider, external_customer_reference
             from billing_customer_binding
             where external_provider = $1`,
            [identity.provider],
          );
          const row = selected.rows[0];
          if (
            selected.rowCount !== 1 ||
            !row ||
            row.external_customer_reference !== identity.customerReference
          )
            throw new BillingCustomerBindingConflictError();
          return result("existing", identityFromRow(row));
        },
      );
    } catch (error) {
      if (
        error instanceof BillingCustomerBindingConflictError ||
        (record(error) && error.code === "23505")
      )
        throw new BillingCustomerBindingConflictError();
      throw error;
    }
  }

  async findForProvider(
    ownerId: AccountId,
    providerValue: unknown,
  ): Promise<BillingCustomerIdentity | null> {
    const provider = validateProvider(providerValue);
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const selected = await client.query<BindingRow>(
        `select external_provider, external_customer_reference
         from billing_customer_binding
         where external_provider = $1`,
        [provider],
      );
      if (selected.rowCount === 0) return null;
      if (selected.rowCount !== 1 || !selected.rows[0])
        throw new TypeError("Billing customer binding result is invalid");
      return identityFromRow(selected.rows[0]);
    });
  }
}

export class BillingCustomerOwnerResolver implements BillingAccountResolver {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async resolveOwner(
    providerValue: string,
    customerReferenceValue: string,
  ): Promise<AccountId | null> {
    const identity = validateIdentity({
      provider: providerValue,
      customerReference: customerReferenceValue,
    });
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("begin");
      transactionOpen = true;
      await client.query("set local role app_billing_resolver");
      const selected = await client.query<ResolverRow>(
        `select app.resolve_billing_customer_owner($1, $2) as owner_id`,
        [identity.provider, identity.customerReference],
      );
      if (selected.rowCount !== 1 || !selected.rows[0])
        throw new TypeError("Billing owner resolver result is invalid");
      const ownerId = selected.rows[0].owner_id;
      if (ownerId !== null && !isUuid(ownerId))
        throw new TypeError("Billing owner resolver result is invalid");
      await client.query("commit");
      transactionOpen = false;
      return ownerId as AccountId | null;
    } catch (error) {
      if (transactionOpen) await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

function validateIdentity(value: unknown): BillingCustomerIdentity {
  if (
    !record(value) ||
    !exactKeys(value, ["provider", "customerReference"]) ||
    !safeProvider(value.provider) ||
    !safeCustomerReference(value.customerReference)
  )
    throw new TypeError("Billing customer identity is invalid");
  return Object.freeze({
    provider: value.provider,
    customerReference: value.customerReference,
  });
}

function validateProvider(value: unknown): string {
  if (!safeProvider(value))
    throw new TypeError("Billing provider identity is invalid");
  return value;
}

function identityFromRow(row: BindingRow): BillingCustomerIdentity {
  return validateIdentity({
    provider: row.external_provider,
    customerReference: row.external_customer_reference,
  });
}

function result(
  outcome: BillingCustomerBindingResult["outcome"],
  identity: BillingCustomerIdentity,
): BillingCustomerBindingResult {
  return Object.freeze({ outcome, identity });
}

async function rollback(client: Pick<PoolClient, "query">): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the resolver failure while release still resets pooled session state.
  }
}

function safeProvider(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /^[a-z][a-z0-9_-]*$/.test(value)
  );
}

function safeCustomerReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isUuid(value: string): value is AccountId {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}
