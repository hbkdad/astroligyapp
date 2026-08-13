export const NOTIFICATION_RETRY_POLICY_VERSION = "1.0.0";
export const NOTIFICATION_MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MINUTES = [1, 5, 30] as const;

export type NotificationDeliveryStatus =
  "pending-provider" | "queued" | "sent" | "failed" | "stale" | "canceled";

export interface NotificationDeliveryState {
  readonly status: NotificationDeliveryStatus;
  readonly attemptCount: number;
  readonly nextAttemptAt: string | null;
  readonly sentAt: string | null;
  readonly failedAt: string | null;
  readonly failureCode: string | null;
  readonly invalidatedAt: string | null;
}

export type NotificationDeliveryEvent =
  | Readonly<{ type: "provider-approved"; at: string }>
  | Readonly<{ type: "delivered"; at: string }>
  | Readonly<{ type: "delivery-failed"; at: string; failureCode: string }>
  | Readonly<{ type: "facts-stale"; at: string }>
  | Readonly<{ type: "consent-withdrawn"; at: string }>;

export type NotificationDeliveryTransition =
  | Readonly<{ ok: true; value: NotificationDeliveryState }>
  | Readonly<{
      ok: false;
      error: "invalid-state" | "invalid-event" | "terminal-state";
    }>;

export function transitionNotificationDelivery(
  state: NotificationDeliveryState,
  event: NotificationDeliveryEvent,
): NotificationDeliveryTransition {
  if (!validState(state) || !validInstant(event.at))
    return Object.freeze({ ok: false, error: "invalid-state" });
  if (["sent", "failed", "stale", "canceled"].includes(state.status))
    return Object.freeze({ ok: false, error: "terminal-state" });

  if (event.type === "facts-stale" || event.type === "consent-withdrawn")
    return success({
      status: event.type === "facts-stale" ? "stale" : "canceled",
      attemptCount: state.attemptCount,
      nextAttemptAt: null,
      sentAt: null,
      failedAt: null,
      failureCode: null,
      invalidatedAt: normalizedInstant(event.at),
    });

  if (event.type === "provider-approved") {
    if (state.status !== "pending-provider")
      return Object.freeze({ ok: false, error: "invalid-event" });
    return success({
      ...state,
      status: "queued",
      nextAttemptAt: normalizedInstant(event.at),
    });
  }

  if (state.status !== "queued")
    return Object.freeze({ ok: false, error: "invalid-event" });
  if (event.type === "delivered")
    return success({
      status: "sent",
      attemptCount: state.attemptCount + 1,
      nextAttemptAt: null,
      sentAt: normalizedInstant(event.at),
      failedAt: null,
      failureCode: null,
      invalidatedAt: null,
    });

  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(event.failureCode))
    return Object.freeze({ ok: false, error: "invalid-event" });
  const attempts = state.attemptCount + 1;
  if (attempts >= NOTIFICATION_MAX_ATTEMPTS)
    return success({
      status: "failed",
      attemptCount: attempts,
      nextAttemptAt: null,
      sentAt: null,
      failedAt: normalizedInstant(event.at),
      failureCode: event.failureCode,
      invalidatedAt: null,
    });
  return success({
    status: "queued",
    attemptCount: attempts,
    nextAttemptAt: new Date(
      Date.parse(event.at) + RETRY_DELAYS_MINUTES[attempts - 1]! * 60_000,
    ).toISOString(),
    sentAt: null,
    failedAt: null,
    failureCode: null,
    invalidatedAt: null,
  });
}

function validState(state: NotificationDeliveryState) {
  const structurallyValid =
    Number.isSafeInteger(state.attemptCount) &&
    state.attemptCount >= 0 &&
    state.attemptCount <= NOTIFICATION_MAX_ATTEMPTS &&
    (state.nextAttemptAt === null || validInstant(state.nextAttemptAt)) &&
    (state.sentAt === null || validInstant(state.sentAt)) &&
    (state.failedAt === null || validInstant(state.failedAt)) &&
    (state.invalidatedAt === null || validInstant(state.invalidatedAt));
  if (!structurallyValid) return false;
  if (state.status === "pending-provider")
    return (
      state.attemptCount === 0 &&
      state.nextAttemptAt === null &&
      emptyTerminalFields(state)
    );
  if (state.status === "queued")
    return (
      state.attemptCount < NOTIFICATION_MAX_ATTEMPTS &&
      state.nextAttemptAt !== null &&
      emptyTerminalFields(state)
    );
  if (state.status === "sent")
    return (
      state.attemptCount >= 1 &&
      state.nextAttemptAt === null &&
      state.sentAt !== null &&
      state.failedAt === null &&
      state.failureCode === null &&
      state.invalidatedAt === null
    );
  if (state.status === "failed")
    return (
      state.attemptCount === NOTIFICATION_MAX_ATTEMPTS &&
      state.nextAttemptAt === null &&
      state.sentAt === null &&
      state.failedAt !== null &&
      typeof state.failureCode === "string" &&
      /^[a-z0-9][a-z0-9-]{0,63}$/.test(state.failureCode) &&
      state.invalidatedAt === null
    );
  return (
    state.nextAttemptAt === null &&
    state.sentAt === null &&
    state.failedAt === null &&
    state.failureCode === null &&
    state.invalidatedAt !== null
  );
}

function emptyTerminalFields(state: NotificationDeliveryState) {
  return (
    state.sentAt === null &&
    state.failedAt === null &&
    state.failureCode === null &&
    state.invalidatedAt === null
  );
}

function validInstant(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function normalizedInstant(value: string) {
  return new Date(value).toISOString();
}

function success(value: NotificationDeliveryState) {
  return Object.freeze({ ok: true, value: Object.freeze(value) } as const);
}
