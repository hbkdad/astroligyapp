import "server-only";

import {
  SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
  SUBSCRIPTION_ENTITLEMENT_STATUSES,
  type SubscriptionEntitlementState,
  type SubscriptionEntitlementStatus,
} from "@/domain/entitlements/contracts";
import {
  SUBSCRIPTION_TRANSITION_EVENT_VERSION,
  SUBSCRIPTION_TRANSITION_STATE_VERSION,
  type NormalizedSubscriptionEvent,
  type SubscriptionTransitionOutcome,
  type SubscriptionTransitionResult,
  type SubscriptionTransitionState,
} from "@/domain/entitlements/subscription-transitions";

const paidPlanKeys = new Set(["personal", "advanced"]);
const statuses = new Set<string>(SUBSCRIPTION_ENTITLEMENT_STATUSES);
const allowedTransitions: Readonly<
  Record<
    SubscriptionEntitlementStatus,
    ReadonlySet<SubscriptionEntitlementStatus>
  >
> = Object.freeze({
  trialing: new Set<SubscriptionEntitlementStatus>([
    "trialing",
    "active",
    "past_due",
    "paused",
    "canceled",
  ]),
  active: new Set<SubscriptionEntitlementStatus>([
    "active",
    "past_due",
    "paused",
    "canceled",
  ]),
  past_due: new Set<SubscriptionEntitlementStatus>([
    "past_due",
    "active",
    "paused",
    "canceled",
  ]),
  paused: new Set<SubscriptionEntitlementStatus>([
    "paused",
    "active",
    "canceled",
  ]),
  canceled: new Set<SubscriptionEntitlementStatus>(["canceled"]),
});

export function applySubscriptionEvent(
  currentValue: unknown,
  eventValue: unknown,
): SubscriptionTransitionResult {
  const current = validateState(currentValue);
  if (currentValue !== null && current === null)
    return result("invalid-current-state", false, null);
  const event = validateEvent(eventValue);
  if (event === null) return result("invalid-event", false, current);
  if (current === null) return result("applied", true, stateFrom(event));

  if (event.eventId === current.lastEventId) {
    return sameSnapshot(current, event)
      ? result("duplicate", false, current)
      : result("conflict", false, current);
  }

  const eventTime = Date.parse(event.occurredAt);
  const currentTime = Date.parse(current.lastEventOccurredAt);
  if (eventTime < currentTime) return result("stale", false, current);
  if (eventTime === currentTime) return result("conflict", false, current);
  if (!transitionAllowed(current, event))
    return result("invalid-transition", false, current);
  return result("applied", true, stateFrom(event));
}

export function projectSubscriptionEntitlementState(
  value: unknown,
): SubscriptionEntitlementState | null {
  const state = validateState(value);
  if (state === null) return null;
  return Object.freeze({
    version: SUBSCRIPTION_ENTITLEMENT_STATE_VERSION,
    planKey: state.planKey,
    status: state.status,
    periodStartsAt: state.periodStartsAt,
    periodEndsAt: state.periodEndsAt,
  });
}

function transitionAllowed(
  current: SubscriptionTransitionState,
  event: NormalizedSubscriptionEvent,
): boolean {
  if (!allowedTransitions[current.status].has(event.status)) return false;

  const currentStart = Date.parse(current.periodStartsAt);
  const currentEnd = Date.parse(current.periodEndsAt);
  const nextStart = Date.parse(event.periodStartsAt);
  const nextEnd = Date.parse(event.periodEndsAt);

  if (current.status === "canceled") {
    return (
      event.status === "canceled" &&
      event.planKey === current.planKey &&
      nextStart === currentStart &&
      nextEnd <= currentEnd
    );
  }

  if (event.status === "canceled") {
    return nextStart >= currentStart && nextEnd <= currentEnd;
  }

  if (event.status === "past_due" || event.status === "paused") {
    return nextStart >= currentStart;
  }

  return nextStart >= currentStart && nextEnd >= currentEnd;
}

function sameSnapshot(
  current: SubscriptionTransitionState,
  event: NormalizedSubscriptionEvent,
): boolean {
  return (
    current.lastEventOccurredAt === event.occurredAt &&
    current.planKey === event.planKey &&
    current.status === event.status &&
    current.periodStartsAt === event.periodStartsAt &&
    current.periodEndsAt === event.periodEndsAt
  );
}

function stateFrom(
  event: NormalizedSubscriptionEvent,
): SubscriptionTransitionState {
  return Object.freeze({
    version: SUBSCRIPTION_TRANSITION_STATE_VERSION,
    planKey: event.planKey,
    status: event.status,
    periodStartsAt: event.periodStartsAt,
    periodEndsAt: event.periodEndsAt,
    lastEventId: event.eventId,
    lastEventOccurredAt: event.occurredAt,
  });
}

function validateEvent(value: unknown): NormalizedSubscriptionEvent | null {
  if (
    !record(value) ||
    !exactKeys(value, [
      "version",
      "eventId",
      "occurredAt",
      "planKey",
      "status",
      "periodStartsAt",
      "periodEndsAt",
    ]) ||
    value.version !== SUBSCRIPTION_TRANSITION_EVENT_VERSION ||
    !eventId(value.eventId) ||
    !canonicalInstant(value.occurredAt) ||
    !paidPlan(value.planKey) ||
    !status(value.status) ||
    typeof value.periodStartsAt !== "string" ||
    typeof value.periodEndsAt !== "string" ||
    !validPeriod(value.periodStartsAt, value.periodEndsAt)
  )
    return null;
  return value as unknown as NormalizedSubscriptionEvent;
}

function validateState(value: unknown): SubscriptionTransitionState | null {
  if (value === null) return null;
  if (
    !record(value) ||
    !exactKeys(value, [
      "version",
      "planKey",
      "status",
      "periodStartsAt",
      "periodEndsAt",
      "lastEventId",
      "lastEventOccurredAt",
    ]) ||
    value.version !== SUBSCRIPTION_TRANSITION_STATE_VERSION ||
    !paidPlan(value.planKey) ||
    !status(value.status) ||
    typeof value.periodStartsAt !== "string" ||
    typeof value.periodEndsAt !== "string" ||
    !validPeriod(value.periodStartsAt, value.periodEndsAt) ||
    !eventId(value.lastEventId) ||
    !canonicalInstant(value.lastEventOccurredAt)
  )
    return null;
  return Object.freeze({
    version: SUBSCRIPTION_TRANSITION_STATE_VERSION,
    planKey: value.planKey,
    status: value.status,
    periodStartsAt: value.periodStartsAt,
    periodEndsAt: value.periodEndsAt,
    lastEventId: value.lastEventId,
    lastEventOccurredAt: value.lastEventOccurredAt,
  });
}

function result(
  outcome: SubscriptionTransitionOutcome,
  changed: boolean,
  state: SubscriptionTransitionState | null,
): SubscriptionTransitionResult {
  return Object.freeze({
    version: SUBSCRIPTION_TRANSITION_STATE_VERSION,
    outcome,
    changed,
    state,
  });
}

function validPeriod(start: string, end: string): boolean {
  return (
    canonicalInstant(start) &&
    canonicalInstant(end) &&
    Date.parse(start) < Date.parse(end)
  );
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function eventId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
  );
}

function paidPlan(value: unknown): value is "personal" | "advanced" {
  return typeof value === "string" && paidPlanKeys.has(value);
}

function status(value: unknown): value is SubscriptionEntitlementStatus {
  return typeof value === "string" && statuses.has(value);
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
