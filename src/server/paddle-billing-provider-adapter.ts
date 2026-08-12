import "server-only";

import {
  EventName,
  LogLevel,
  Paddle,
  type EventEntity,
} from "@paddle/paddle-node-sdk";

import {
  SUBSCRIPTION_TRANSITION_EVENT_VERSION,
  type NormalizedSubscriptionEvent,
} from "@/domain/entitlements/subscription-transitions";
import type {
  BillingProviderAdapter,
  BillingWebhookAdapterRequest,
  BillingWebhookAdapterResult,
} from "@/server/billing-webhook-contracts";

export const PADDLE_BILLING_ADAPTER_VERSION = "1.0.0";
export const PADDLE_PROVIDER_KEY = "paddle";
export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 5;

const PADDLE_WEBHOOK_CLIENT_KEY = "webhook-verification-only";
const allowedEventTypes = new Set<string>([
  EventName.SubscriptionActivated,
  EventName.SubscriptionCanceled,
  EventName.SubscriptionCreated,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionResumed,
  EventName.SubscriptionTrialing,
  EventName.SubscriptionUpdated,
]);
const allowedStatuses = new Set([
  "active",
  "canceled",
  "past_due",
  "paused",
  "trialing",
]);
const allowedItemStatuses = new Set(["active", "inactive", "trialing"]);
const expectedStatusByEvent = new Map<string, string>([
  [EventName.SubscriptionActivated, "active"],
  [EventName.SubscriptionCanceled, "canceled"],
  [EventName.SubscriptionPastDue, "past_due"],
  [EventName.SubscriptionPaused, "paused"],
  [EventName.SubscriptionResumed, "active"],
  [EventName.SubscriptionTrialing, "trialing"],
]);

export interface PaddleBillingAdapterConfiguration {
  readonly version: typeof PADDLE_BILLING_ADAPTER_VERSION;
  readonly webhookSecret: string;
  readonly priceReferences: Readonly<{
    personal: readonly string[];
    advanced: readonly string[];
  }>;
}

export class PaddleBillingAdapterConfigurationError extends Error {
  constructor() {
    super("Paddle billing adapter configuration is invalid.");
    this.name = "PaddleBillingAdapterConfigurationError";
  }
}

export function createPaddleBillingProviderAdapter(
  configurationValue: unknown,
): BillingProviderAdapter {
  const configuration = validateConfiguration(configurationValue);
  const planByPriceReference = new Map<string, "personal" | "advanced">();
  for (const priceReference of configuration.priceReferences.personal)
    planByPriceReference.set(priceReference, "personal");
  for (const priceReference of configuration.priceReferences.advanced)
    planByPriceReference.set(priceReference, "advanced");

  const paddle = new Paddle(PADDLE_WEBHOOK_CLIENT_KEY, {
    logLevel: LogLevel.none,
  });

  return Object.freeze({
    providerKey: PADDLE_PROVIDER_KEY,
    async verifyAndNormalize(
      request: BillingWebhookAdapterRequest,
    ): Promise<BillingWebhookAdapterResult> {
      const signature = request.headers["paddle-signature"];
      if (!signature) return rejected("invalid-signature");

      const signatureTimestamp = parseSignatureTimestamp(signature);
      if (signatureTimestamp === null) return rejected("invalid-signature");
      const receivedAt = parseCanonicalInstant(request.receivedAt);
      if (receivedAt === null) return rejected("malformed");
      if (
        Math.abs(receivedAt - signatureTimestamp) >
        PADDLE_SIGNATURE_TOLERANCE_SECONDS * 1_000
      )
        return rejected("stale");

      let rawBody: string;
      try {
        rawBody = new TextDecoder("utf-8", { fatal: true }).decode(
          request.rawBody,
        );
      } catch {
        return rejected("malformed");
      }

      let signatureValid: boolean;
      try {
        signatureValid = await paddle.webhooks.isSignatureValid(
          rawBody,
          configuration.webhookSecret,
          signature,
        );
      } catch {
        return rejected("invalid-signature");
      }
      if (!signatureValid) return rejected("invalid-signature");

      let rawEvent: unknown;
      try {
        rawEvent = JSON.parse(rawBody) as unknown;
      } catch {
        return rejected("malformed");
      }
      if (!record(rawEvent) || typeof rawEvent.event_type !== "string")
        return rejected("malformed");
      if (!allowedEventTypes.has(rawEvent.event_type))
        return rejected("unsupported");

      let verifiedEvent: EventEntity;
      try {
        verifiedEvent = await paddle.webhooks.unmarshal(
          rawBody,
          configuration.webhookSecret,
          signature,
        );
      } catch (error) {
        return rejected(
          error instanceof SyntaxError || error instanceof TypeError
            ? "malformed"
            : "invalid-signature",
        );
      }

      const normalized = normalizeSubscriptionEvent(
        verifiedEvent,
        planByPriceReference,
      );
      if (!normalized) return rejected("malformed");
      return Object.freeze({
        status: "verified" as const,
        identity: Object.freeze({
          provider: PADDLE_PROVIDER_KEY,
          customerReference: normalized.customerReference,
          subscriptionReference: normalized.subscriptionReference,
        }),
        event: normalized.event,
      });
    },
  });
}

function normalizeSubscriptionEvent(
  verifiedEvent: EventEntity,
  planByPriceReference: ReadonlyMap<string, "personal" | "advanced">,
): Readonly<{
  customerReference: string;
  subscriptionReference: string;
  event: NormalizedSubscriptionEvent;
}> | null {
  if (
    !safeReference(verifiedEvent.eventId, /^evt_[a-z0-9]{26}$/) ||
    providerInstant(verifiedEvent.occurredAt) === null ||
    !record(verifiedEvent.data)
  )
    return null;

  const data = verifiedEvent.data;
  if (
    !safeReference(data.id, /^sub_[a-z0-9]{26}$/) ||
    !safeReference(data.customerId, /^ctm_[a-z0-9]{26}$/) ||
    !validSubscriptionStatus(data.status) ||
    !Array.isArray(data.items) ||
    data.items.length !== 1
  )
    return null;

  const expectedStatus = expectedStatusByEvent.get(verifiedEvent.eventType);
  if (expectedStatus !== undefined && data.status !== expectedStatus)
    return null;

  const item = data.items[0];
  if (
    !record(item) ||
    typeof item.status !== "string" ||
    !allowedItemStatuses.has(item.status) ||
    item.recurring !== true ||
    item.quantity !== 1 ||
    !record(item.price) ||
    !safeReference(item.price.id, /^pri_[a-z0-9]{26}$/)
  )
    return null;
  const planKey = planByPriceReference.get(item.price.id);
  if (!planKey) return null;

  const period = subscriptionPeriod(data, data.status);
  const occurredAt = providerInstant(verifiedEvent.occurredAt);
  if (
    !occurredAt ||
    !period ||
    Date.parse(period.startsAt) >= Date.parse(period.endsAt)
  )
    return null;

  return Object.freeze({
    customerReference: data.customerId,
    subscriptionReference: data.id,
    event: Object.freeze({
      version: SUBSCRIPTION_TRANSITION_EVENT_VERSION,
      eventId: verifiedEvent.eventId,
      occurredAt,
      planKey,
      status: data.status,
      periodStartsAt: period.startsAt,
      periodEndsAt: period.endsAt,
    }),
  });
}

function validateConfiguration(
  value: unknown,
): Readonly<PaddleBillingAdapterConfiguration> {
  if (
    !record(value) ||
    !exactKeys(value, ["version", "webhookSecret", "priceReferences"]) ||
    value.version !== PADDLE_BILLING_ADAPTER_VERSION ||
    typeof value.webhookSecret !== "string" ||
    !/^pdl_ntfset_[A-Za-z0-9_]{32,200}$/.test(value.webhookSecret) ||
    !record(value.priceReferences) ||
    !exactKeys(value.priceReferences, ["personal", "advanced"]) ||
    !validPriceReferences(value.priceReferences.personal) ||
    !validPriceReferences(value.priceReferences.advanced)
  )
    throw new PaddleBillingAdapterConfigurationError();

  const personal = [...value.priceReferences.personal];
  const advanced = [...value.priceReferences.advanced];
  if (
    new Set([...personal, ...advanced]).size !==
    personal.length + advanced.length
  )
    throw new PaddleBillingAdapterConfigurationError();

  return Object.freeze({
    version: PADDLE_BILLING_ADAPTER_VERSION,
    webhookSecret: value.webhookSecret,
    priceReferences: Object.freeze({
      personal: Object.freeze(personal),
      advanced: Object.freeze(advanced),
    }),
  });
}

function validPriceReferences(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 16 &&
    value.every((reference) =>
      safeReference(reference, /^pri_[a-z0-9]{26}$/),
    ) &&
    new Set(value).size === value.length
  );
}

function validSubscriptionStatus(
  value: unknown,
): value is NormalizedSubscriptionEvent["status"] {
  return typeof value === "string" && allowedStatuses.has(value);
}

function subscriptionPeriod(
  data: Readonly<Record<string, unknown>>,
  status: NormalizedSubscriptionEvent["status"],
): Readonly<{ startsAt: string; endsAt: string }> | null {
  if (record(data.currentBillingPeriod)) {
    const startsAt = providerInstant(data.currentBillingPeriod.startsAt);
    const endsAt = providerInstant(data.currentBillingPeriod.endsAt);
    return startsAt && endsAt ? Object.freeze({ startsAt, endsAt }) : null;
  }
  if (data.currentBillingPeriod !== null) return null;

  const endsAt = providerInstant(
    status === "paused"
      ? data.pausedAt
      : status === "canceled"
        ? data.canceledAt
        : null,
  );
  const startsAt = providerInstant(data.startedAt);
  return startsAt && endsAt ? Object.freeze({ startsAt, endsAt }) : null;
}

function parseSignatureTimestamp(value: string): number | null {
  const parts = value.split(";");
  if (parts.length !== 2) return null;
  const timestampParts = parts.filter((part) => part.startsWith("ts="));
  const signatureParts = parts.filter((part) => part.startsWith("h1="));
  if (timestampParts.length !== 1 || signatureParts.length !== 1) return null;
  const timestamp = timestampParts[0]!.slice(3);
  const signature = signatureParts[0]!.slice(3);
  if (!/^[1-9][0-9]{9}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature))
    return null;
  const milliseconds = Number(timestamp) * 1_000;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function parseCanonicalInstant(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString() === value ? milliseconds : null;
}

function providerInstant(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  )
    return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonical = new Date(milliseconds).toISOString();
  return canonical.slice(0, 19) === value.slice(0, 19) ? canonical : null;
}

function safeReference(
  value: unknown,
  pattern: Readonly<RegExp>,
): value is string {
  return typeof value === "string" && pattern.test(value);
}

function rejected(
  reason: Extract<
    BillingWebhookAdapterResult,
    { status: "rejected" }
  >["reason"],
): BillingWebhookAdapterResult {
  return Object.freeze({ status: "rejected" as const, reason });
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
