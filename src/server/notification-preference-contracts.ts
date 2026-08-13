import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_LEAD_MINUTES,
  type NotificationEventType,
  type NotificationLeadMinutes,
} from "@/application/materialize-notification-candidates";

export const NOTIFICATION_PREFERENCE_CONTRACT_VERSION = "1.0.0";

export interface NotificationPreferenceCommand {
  readonly version: typeof NOTIFICATION_PREFERENCE_CONTRACT_VERSION;
  readonly operation: "replace";
  readonly profileId: string;
  readonly birthProfileId: string;
  readonly profileRevision: number;
  readonly preferenceRevision: number;
  readonly channel: "email";
  readonly consent: boolean;
  readonly eventTypes: readonly NotificationEventType[];
  readonly leadMinutes: NotificationLeadMinutes;
  readonly quietHours: Readonly<{ start: string; end: string }> | null;
}

export function validateNotificationPreferenceCommand(
  value: unknown,
): NotificationPreferenceCommand | null {
  if (
    !record(value) ||
    !exact(value, [
      "version",
      "operation",
      "profileId",
      "birthProfileId",
      "profileRevision",
      "preferenceRevision",
      "channel",
      "consent",
      "eventTypes",
      "leadMinutes",
      "quietHours",
    ]) ||
    value.version !== NOTIFICATION_PREFERENCE_CONTRACT_VERSION ||
    value.operation !== "replace" ||
    !uuid(value.profileId) ||
    !uuid(value.birthProfileId) ||
    !revision(value.profileRevision, 1) ||
    !revision(value.preferenceRevision, 0) ||
    value.channel !== "email" ||
    typeof value.consent !== "boolean" ||
    !Array.isArray(value.eventTypes) ||
    value.eventTypes.length > NOTIFICATION_EVENT_TYPES.length ||
    value.eventTypes.some(
      (item, index) =>
        item !== NOTIFICATION_EVENT_TYPES[index] &&
        !NOTIFICATION_EVENT_TYPES.includes(item),
    ) ||
    new Set(value.eventTypes).size !== value.eventTypes.length ||
    !ordered(value.eventTypes) ||
    !NOTIFICATION_LEAD_MINUTES.includes(
      value.leadMinutes as NotificationLeadMinutes,
    ) ||
    !quiet(value.quietHours) ||
    (value.consent && value.eventTypes.length === 0) ||
    (!value.consent && value.eventTypes.length > 0)
  )
    return null;
  return deepFreeze({
    version: NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
    operation: "replace",
    profileId: value.profileId,
    birthProfileId: value.birthProfileId,
    profileRevision: value.profileRevision,
    preferenceRevision: value.preferenceRevision,
    channel: "email",
    consent: value.consent,
    eventTypes: value.eventTypes as NotificationEventType[],
    leadMinutes: value.leadMinutes as NotificationLeadMinutes,
    quietHours: value.quietHours as Readonly<{
      start: string;
      end: string;
    }> | null,
  });
}

export interface NotificationPreferenceSelection {
  readonly version: typeof NOTIFICATION_PREFERENCE_CONTRACT_VERSION;
  readonly profileId: string;
  readonly birthProfileId: string;
  readonly profileRevision: number;
}

export function validateNotificationPreferenceSelection(
  value: unknown,
): NotificationPreferenceSelection | null {
  if (
    !record(value) ||
    !exact(value, [
      "version",
      "profileId",
      "birthProfileId",
      "profileRevision",
    ]) ||
    value.version !== NOTIFICATION_PREFERENCE_CONTRACT_VERSION ||
    !uuid(value.profileId) ||
    !uuid(value.birthProfileId) ||
    !revision(value.profileRevision, 1)
  )
    return null;
  return Object.freeze({
    version: NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
    profileId: value.profileId,
    birthProfileId: value.birthProfileId,
    profileRevision: value.profileRevision,
  });
}

function ordered(values: readonly unknown[]) {
  return values.every(
    (value, index) =>
      index === 0 ||
      NOTIFICATION_EVENT_TYPES.indexOf(value as NotificationEventType) >
        NOTIFICATION_EVENT_TYPES.indexOf(
          values[index - 1] as NotificationEventType,
        ),
  );
}

function quiet(value: unknown): boolean {
  return (
    value === null ||
    (record(value) &&
      exact(value, ["start", "end"]) &&
      clock(value.start) &&
      clock(value.end) &&
      value.start !== value.end)
  );
}

function clock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function revision(value: unknown, minimum: number): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= 999_999_999
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
