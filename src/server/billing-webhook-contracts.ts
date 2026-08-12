import type { AccountId } from "@/infrastructure/auth/account";
import type { NormalizedSubscriptionEvent } from "@/domain/entitlements/subscription-transitions";
import type {
  StoredSubscriptionTransitionResult,
  SubscriptionProviderIdentity,
} from "@/infrastructure/persistence/subscription-repository";

export const BILLING_WEBHOOK_ORCHESTRATOR_VERSION = "1.0.0";

export interface BillingWebhookAdapterRequest {
  readonly rawBody: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly receivedAt: string;
}

export type BillingWebhookAdapterResult =
  | Readonly<{
      status: "rejected";
      reason: "invalid-signature" | "stale" | "malformed" | "unsupported";
    }>
  | Readonly<{
      status: "verified";
      identity: SubscriptionProviderIdentity;
      event: NormalizedSubscriptionEvent;
    }>;

export interface BillingProviderAdapter {
  readonly providerKey: string;
  verifyAndNormalize(
    request: BillingWebhookAdapterRequest,
  ): Promise<BillingWebhookAdapterResult>;
}

export interface BillingAccountResolver {
  resolveOwner(
    provider: string,
    customerReference: string,
  ): Promise<AccountId | null>;
}

export interface BillingSubscriptionWriter {
  applyNormalizedEvent(
    ownerId: AccountId,
    identity: SubscriptionProviderIdentity,
    event: NormalizedSubscriptionEvent,
  ): Promise<StoredSubscriptionTransitionResult>;
}

export interface TrustedBillingClock {
  now(): Date;
}

export type BillingWebhookDisposition =
  | Readonly<{
      version: typeof BILLING_WEBHOOK_ORCHESTRATOR_VERSION;
      disposition: "acknowledge";
      statusCode: 200;
      code: "processed" | "state-conflict";
    }>
  | Readonly<{
      version: typeof BILLING_WEBHOOK_ORCHESTRATOR_VERSION;
      disposition: "reject";
      statusCode: 400;
      code:
        | "invalid-request"
        | "verification-rejected"
        | "adapter-contract-invalid";
    }>
  | Readonly<{
      version: typeof BILLING_WEBHOOK_ORCHESTRATOR_VERSION;
      disposition: "retry";
      statusCode: 503;
      code:
        | "adapter-unavailable"
        | "clock-unavailable"
        | "owner-unavailable"
        | "persistence-unavailable";
    }>;
