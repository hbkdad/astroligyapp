import "server-only";

import {
  BILLING_WEBHOOK_ORCHESTRATOR_VERSION,
  BILLING_WEBHOOK_MAXIMUM_BYTES,
  BILLING_WEBHOOK_MAXIMUM_HEADERS,
  type BillingAccountResolver,
  type BillingProviderAdapter,
  type BillingSubscriptionWriter,
  type BillingWebhookAdapterRequest,
  type BillingWebhookAdapterResult,
  type BillingWebhookDisposition,
  type TrustedBillingClock,
} from "@/server/billing-webhook-contracts";
import type { AccountId } from "@/infrastructure/auth/account";
import {
  SubscriptionIdentityConflictError,
  type SubscriptionProviderIdentity,
} from "@/infrastructure/persistence/subscription-repository";
import { validateNormalizedSubscriptionEvent } from "@/server/subscription-transition-engine";

const MAXIMUM_HEADER_NAME_LENGTH = 128;
const MAXIMUM_HEADER_VALUE_LENGTH = 8 * 1024;
const rejectedReasons = new Set([
  "invalid-signature",
  "stale",
  "malformed",
  "unsupported",
]);
const storedOutcomes = new Set([
  "applied",
  "duplicate",
  "stale",
  "conflict",
  "invalid-transition",
  "invalid-event",
  "invalid-current-state",
]);

export async function processBillingWebhook(
  requestValue: unknown,
  dependencies: Readonly<{
    adapter: BillingProviderAdapter;
    accountResolver: BillingAccountResolver;
    subscriptionWriter: BillingSubscriptionWriter;
    clock: TrustedBillingClock;
  }>,
): Promise<BillingWebhookDisposition> {
  let receivedAt: Date;
  try {
    receivedAt = dependencies.clock.now();
  } catch {
    return retry("clock-unavailable");
  }
  if (!(receivedAt instanceof Date) || !Number.isFinite(receivedAt.getTime()))
    return retry("clock-unavailable");
  const request = normalizeRequest(requestValue, receivedAt);
  if (!request) return reject("invalid-request");

  let adapterResult: BillingWebhookAdapterResult;
  try {
    adapterResult = await dependencies.adapter.verifyAndNormalize(request);
  } catch {
    return retry("adapter-unavailable");
  }
  if (!validAdapterResult(adapterResult, dependencies.adapter.providerKey))
    return reject("adapter-contract-invalid");
  if (adapterResult.status === "rejected")
    return reject("verification-rejected");

  let ownerId: AccountId | null;
  try {
    ownerId = await dependencies.accountResolver.resolveOwner(
      adapterResult.identity.provider,
      adapterResult.identity.customerReference,
    );
  } catch {
    return retry("owner-unavailable");
  }
  if (!ownerId || !isUuid(ownerId)) return retry("owner-unavailable");

  try {
    const stored = await dependencies.subscriptionWriter.applyNormalizedEvent(
      ownerId,
      adapterResult.identity,
      adapterResult.event,
    );
    if (!validStoredResult(stored)) return retry("persistence-unavailable");
    if (stored.outcome === "invalid-event")
      return reject("adapter-contract-invalid");
    if (stored.outcome === "invalid-current-state")
      return acknowledge("state-conflict");
    return acknowledge(
      stored.outcome === "conflict" ? "state-conflict" : "processed",
    );
  } catch (error) {
    if (error instanceof SubscriptionIdentityConflictError)
      return acknowledge("state-conflict");
    return retry("persistence-unavailable");
  }
}

function normalizeRequest(
  value: unknown,
  receivedAt: Date,
): BillingWebhookAdapterRequest | null {
  if (!record(value) || !exactKeys(value, ["rawBody", "headers"])) return null;
  if (
    !(value.rawBody instanceof Uint8Array) ||
    value.rawBody.byteLength < 1 ||
    value.rawBody.byteLength > BILLING_WEBHOOK_MAXIMUM_BYTES ||
    !record(value.headers)
  )
    return null;
  const entries = Object.entries(value.headers);
  if (entries.length < 1 || entries.length > BILLING_WEBHOOK_MAXIMUM_HEADERS)
    return null;
  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of entries) {
    const name = rawName.toLowerCase();
    if (
      rawName.length < 1 ||
      rawName.length > MAXIMUM_HEADER_NAME_LENGTH ||
      !/^[A-Za-z0-9-]+$/.test(rawName) ||
      typeof rawValue !== "string" ||
      rawValue.length > MAXIMUM_HEADER_VALUE_LENGTH ||
      /[\0\r\n]/.test(rawValue) ||
      Object.hasOwn(headers, name)
    )
      return null;
    headers[name] = rawValue;
  }
  return Object.freeze({
    rawBody: new Uint8Array(value.rawBody),
    headers: Object.freeze(headers),
    receivedAt: receivedAt.toISOString(),
  });
}

function validStoredResult(
  value: unknown,
): value is Awaited<
  ReturnType<BillingSubscriptionWriter["applyNormalizedEvent"]>
> {
  return (
    record(value) &&
    exactKeys(value, ["outcome", "changed", "entitlementState"]) &&
    typeof value.outcome === "string" &&
    storedOutcomes.has(value.outcome) &&
    typeof value.changed === "boolean" &&
    (value.entitlementState === null || record(value.entitlementState))
  );
}

function validAdapterResult(
  value: unknown,
  expectedProvider: unknown,
): value is BillingWebhookAdapterResult {
  if (!safeProvider(expectedProvider) || !record(value)) return false;
  if (value.status === "rejected")
    return (
      exactKeys(value, ["status", "reason"]) &&
      typeof value.reason === "string" &&
      rejectedReasons.has(value.reason)
    );
  if (
    value.status !== "verified" ||
    !exactKeys(value, ["status", "identity", "event"]) ||
    !validIdentity(value.identity, expectedProvider)
  )
    return false;
  return validateNormalizedSubscriptionEvent(value.event) !== null;
}

function validIdentity(
  value: unknown,
  expectedProvider: string,
): value is SubscriptionProviderIdentity {
  return (
    record(value) &&
    exactKeys(value, [
      "provider",
      "customerReference",
      "subscriptionReference",
    ]) &&
    value.provider === expectedProvider &&
    safeReference(value.customerReference, 200) &&
    safeReference(value.subscriptionReference, 200)
  );
}

function safeProvider(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /^[a-z][a-z0-9_-]*$/.test(value)
  );
}

function safeReference(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function acknowledge(
  code: Extract<
    BillingWebhookDisposition,
    { disposition: "acknowledge" }
  >["code"],
): BillingWebhookDisposition {
  return Object.freeze({
    version: BILLING_WEBHOOK_ORCHESTRATOR_VERSION,
    disposition: "acknowledge" as const,
    statusCode: 200 as const,
    code,
  });
}

function reject(
  code: Extract<BillingWebhookDisposition, { disposition: "reject" }>["code"],
): BillingWebhookDisposition {
  return Object.freeze({
    version: BILLING_WEBHOOK_ORCHESTRATOR_VERSION,
    disposition: "reject" as const,
    statusCode: 400 as const,
    code,
  });
}

function retry(
  code: Extract<BillingWebhookDisposition, { disposition: "retry" }>["code"],
): BillingWebhookDisposition {
  return Object.freeze({
    version: BILLING_WEBHOOK_ORCHESTRATOR_VERSION,
    disposition: "retry" as const,
    statusCode: 503 as const,
    code,
  });
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
