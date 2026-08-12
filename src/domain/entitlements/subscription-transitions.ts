import type {
  SubscriptionEntitlementState,
  SubscriptionEntitlementStatus,
} from "@/domain/entitlements/contracts";

export const SUBSCRIPTION_TRANSITION_EVENT_VERSION = "1.0.0";
export const SUBSCRIPTION_TRANSITION_STATE_VERSION = "1.0.0";

export interface NormalizedSubscriptionEvent {
  readonly version: typeof SUBSCRIPTION_TRANSITION_EVENT_VERSION;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly planKey: SubscriptionEntitlementState["planKey"];
  readonly status: SubscriptionEntitlementStatus;
  readonly periodStartsAt: string;
  readonly periodEndsAt: string;
}

export interface SubscriptionTransitionState {
  readonly version: typeof SUBSCRIPTION_TRANSITION_STATE_VERSION;
  readonly planKey: SubscriptionEntitlementState["planKey"];
  readonly status: SubscriptionEntitlementStatus;
  readonly periodStartsAt: string;
  readonly periodEndsAt: string;
  readonly lastEventId: string;
  readonly lastEventOccurredAt: string;
}

export type SubscriptionTransitionOutcome =
  | "applied"
  | "duplicate"
  | "stale"
  | "conflict"
  | "invalid-transition"
  | "invalid-event"
  | "invalid-current-state";

export interface SubscriptionTransitionResult {
  readonly version: typeof SUBSCRIPTION_TRANSITION_STATE_VERSION;
  readonly outcome: SubscriptionTransitionOutcome;
  readonly changed: boolean;
  readonly state: SubscriptionTransitionState | null;
}
