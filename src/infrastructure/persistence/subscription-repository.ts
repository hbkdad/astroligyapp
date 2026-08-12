import "server-only";

import type { Pool } from "pg";

import type { AccountId } from "@/infrastructure/auth/account";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import type { SubscriptionEntitlementState } from "@/domain/entitlements/contracts";
import type {
  SubscriptionTransitionOutcome,
  SubscriptionTransitionState,
} from "@/domain/entitlements/subscription-transitions";
import {
  applySubscriptionEvent,
  digestNormalizedSubscriptionEvent,
  projectSubscriptionEntitlementState,
  validateNormalizedSubscriptionEvent,
} from "@/server/subscription-transition-engine";

export interface SubscriptionProviderIdentity {
  readonly provider: string;
  readonly customerReference: string;
  readonly subscriptionReference: string;
}

export interface StoredSubscriptionTransitionResult {
  readonly outcome: SubscriptionTransitionOutcome;
  readonly changed: boolean;
  readonly entitlementState: SubscriptionEntitlementState | null;
}

interface SubscriptionRow {
  id: string;
  external_customer_reference: string;
  plan_key: string;
  status: string;
  period_starts_at: Date | string | null;
  period_ends_at: Date | string | null;
  transition_state_version: string | null;
  last_provider_event_id: string | null;
  last_provider_event_occurred_at: Date | string | null;
}

interface SubscriptionEventReceiptRow {
  subscription_id: string;
  normalized_event_digest: string;
}

export class SubscriptionIdentityConflictError extends Error {
  constructor() {
    super("Subscription identity conflicts with existing state");
    this.name = "SubscriptionIdentityConflictError";
  }
}

export class SubscriptionRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async applyNormalizedEvent(
    ownerId: AccountId,
    identityValue: SubscriptionProviderIdentity,
    event: unknown,
  ): Promise<StoredSubscriptionTransitionResult> {
    const identity = validateIdentity(identityValue);
    const normalizedEvent = validateNormalizedSubscriptionEvent(event);
    const eventDigest = digestNormalizedSubscriptionEvent(normalizedEvent);
    if (!normalizedEvent || !eventDigest)
      return storedResult("invalid-event", false, null);
    try {
      return await withIdentityTransaction(
        this.pool,
        ownerId,
        async ({ client }) => {
          await client.query(
            "select pg_advisory_xact_lock(hashtextextended($1, 0))",
            [
              JSON.stringify([
                identity.provider,
                identity.subscriptionReference,
              ]),
            ],
          );
          const selected = await client.query<SubscriptionRow>(
            `select id, external_customer_reference, plan_key, status,
                    period_starts_at, period_ends_at, transition_state_version,
                    last_provider_event_id, last_provider_event_occurred_at
             from subscription
             where external_provider = $1
               and external_subscription_reference = $2
             for update`,
            [identity.provider, identity.subscriptionReference],
          );
          const row = selected.rows[0];
          if (
            row &&
            row.external_customer_reference !== identity.customerReference
          )
            throw new SubscriptionIdentityConflictError();

          const receipts = await client.query<SubscriptionEventReceiptRow>(
            `select subscription_id, normalized_event_digest
             from subscription_provider_event_receipt
             where external_provider = $1 and provider_event_id = $2`,
            [identity.provider, normalizedEvent.eventId],
          );
          const receipt = receipts.rows[0];
          if (receipt) {
            const exact =
              row?.id === receipt.subscription_id &&
              receipt.normalized_event_digest === eventDigest;
            return storedResult(
              exact ? "duplicate" : "conflict",
              false,
              row
                ? projectSubscriptionEntitlementState(stateFromRow(row))
                : null,
            );
          }

          const transition = applySubscriptionEvent(
            row ? stateFromRow(row) : null,
            normalizedEvent,
          );
          if (
            transition.outcome === "invalid-current-state" ||
            transition.outcome === "invalid-event" ||
            transition.outcome === "duplicate" ||
            !transition.state
          )
            return storedResult(
              transition.outcome,
              false,
              projectSubscriptionEntitlementState(transition.state),
            );

          let subscriptionId = row?.id;
          if (row) {
            if (transition.outcome === "applied")
              await client.query(
                `update subscription
               set plan_key = $2,
                   status = $3,
                   period_starts_at = $4,
                   period_ends_at = $5,
                   transition_state_version = $6,
                   last_provider_event_id = $7,
                   last_provider_event_occurred_at = $8,
                   updated_at = CURRENT_TIMESTAMP
               where id = $1`,
                stateParameters(row.id, transition.state),
              );
          } else {
            const inserted = await client.query<{ id: string }>(
              `insert into subscription
                 (user_account_id, plan_key, status, external_provider,
                  external_customer_reference, external_subscription_reference,
                  period_starts_at, period_ends_at, transition_state_version,
                  last_provider_event_id, last_provider_event_occurred_at)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               returning id`,
              [
                ownerId,
                transition.state.planKey,
                transition.state.status,
                identity.provider,
                identity.customerReference,
                identity.subscriptionReference,
                transition.state.periodStartsAt,
                transition.state.periodEndsAt,
                transition.state.version,
                transition.state.lastEventId,
                transition.state.lastEventOccurredAt,
              ],
            );
            subscriptionId = inserted.rows[0]!.id;
          }
          await client.query(
            `insert into subscription_provider_event_receipt
               (subscription_id, external_provider, provider_event_id,
                normalized_event_digest, occurred_at, outcome)
             values ($1, $2, $3, $4, $5, $6)`,
            [
              subscriptionId,
              identity.provider,
              normalizedEvent.eventId,
              eventDigest,
              normalizedEvent.occurredAt,
              transition.outcome,
            ],
          );
          return storedResult(
            transition.outcome,
            transition.changed,
            projectSubscriptionEntitlementState(transition.state),
          );
        },
      );
    } catch (error) {
      if (
        error instanceof SubscriptionIdentityConflictError ||
        (record(error) && error.code === "23505")
      )
        throw new SubscriptionIdentityConflictError();
      throw error;
    }
  }

  async findEntitlementState(
    ownerId: AccountId,
    identityValue: SubscriptionProviderIdentity,
  ): Promise<SubscriptionEntitlementState | null> {
    const identity = validateIdentity(identityValue);
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const selected = await client.query<SubscriptionRow>(
        `select id, external_customer_reference, plan_key, status,
                period_starts_at, period_ends_at, transition_state_version,
                last_provider_event_id, last_provider_event_occurred_at
         from subscription
         where external_provider = $1
           and external_subscription_reference = $2
           and external_customer_reference = $3`,
        [
          identity.provider,
          identity.subscriptionReference,
          identity.customerReference,
        ],
      );
      const row = selected.rows[0];
      return row
        ? projectSubscriptionEntitlementState(stateFromRow(row))
        : null;
    });
  }
}

function stateFromRow(row: SubscriptionRow): unknown {
  return {
    version: row.transition_state_version,
    planKey: row.plan_key,
    status: row.status,
    periodStartsAt: instant(row.period_starts_at),
    periodEndsAt: instant(row.period_ends_at),
    lastEventId: row.last_provider_event_id,
    lastEventOccurredAt: instant(row.last_provider_event_occurred_at),
  };
}

function stateParameters(id: string, state: SubscriptionTransitionState) {
  return [
    id,
    state.planKey,
    state.status,
    state.periodStartsAt,
    state.periodEndsAt,
    state.version,
    state.lastEventId,
    state.lastEventOccurredAt,
  ];
}

function storedResult(
  outcome: SubscriptionTransitionOutcome,
  changed: boolean,
  entitlementState: SubscriptionEntitlementState | null,
): StoredSubscriptionTransitionResult {
  return Object.freeze({ outcome, changed, entitlementState });
}

function validateIdentity(
  value: SubscriptionProviderIdentity,
): SubscriptionProviderIdentity {
  if (
    !record(value) ||
    !exactKeys(value, [
      "provider",
      "customerReference",
      "subscriptionReference",
    ]) ||
    !safeReference(value.provider, 64, /^[a-z][a-z0-9_-]*$/) ||
    !safeReference(value.customerReference, 200) ||
    !safeReference(value.subscriptionReference, 200)
  )
    throw new TypeError("Subscription provider identity is invalid");
  return Object.freeze({
    provider: value.provider,
    customerReference: value.customerReference,
    subscriptionReference: value.subscriptionReference,
  });
}

function safeReference(
  value: unknown,
  maximumLength: number,
  pattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maximumLength &&
    pattern.test(value)
  );
}

function instant(value: Date | string | null): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString();
  return typeof value === "string" ? new Date(value).toISOString() : null;
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
