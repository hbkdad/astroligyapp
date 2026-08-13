import "server-only";

import type { NotificationPreferenceActionState } from "@/presentation/notification-preference-state";
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_LEAD_MINUTES,
  type NotificationEventType,
} from "@/application/materialize-notification-candidates";
import type { NotificationPreferenceResponse } from "@/server/authenticated-notification-preferences";
import {
  NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
  validateNotificationPreferenceCommand,
  validateNotificationPreferenceSelection,
  type NotificationPreferenceCommand,
  type NotificationPreferenceSelection,
} from "@/server/notification-preference-contracts";

const MAX_COOKIE_BYTES = 8_192;
const MAX_JSON_BYTES = 1_024;

export interface NotificationPreferenceService {
  readonly canonicalOrigin: string;
  loadNotificationPreferences(
    request: Request,
    selection: NotificationPreferenceSelection,
  ): Promise<NotificationPreferenceResponse>;
  replaceNotificationPreferences(
    request: Request,
    command: NotificationPreferenceCommand,
  ): Promise<NotificationPreferenceResponse>;
}

export async function loadNotificationPreferencesFromForm(
  requestHeaders: Pick<Headers, "get">,
  formData: FormData,
  getService: () => NotificationPreferenceService,
): Promise<NotificationPreferenceActionState> {
  let selection: NotificationPreferenceSelection;
  try {
    selection = selectionFromForm(formData);
  } catch {
    return state("authorize");
  }
  try {
    const service = getService();
    return project(
      await service.loadNotificationPreferences(
        internalRequest(requestHeaders, service.canonicalOrigin, "load"),
        selection,
      ),
    );
  } catch {
    return state("retry");
  }
}

export async function replaceNotificationPreferencesFromForm(
  requestHeaders: Pick<Headers, "get">,
  formData: FormData,
  getService: () => NotificationPreferenceService,
): Promise<NotificationPreferenceActionState> {
  let command: NotificationPreferenceCommand;
  try {
    command = commandFromForm(formData);
  } catch {
    return state("authorize");
  }
  try {
    const service = getService();
    return project(
      await service.replaceNotificationPreferences(
        internalRequest(requestHeaders, service.canonicalOrigin, "replace"),
        command,
      ),
    );
  } catch {
    return state("retry");
  }
}

function selectionFromForm(formData: FormData) {
  const value = exactForm(formData, [
    "version",
    "profileId",
    "birthProfileId",
    "profileRevision",
  ]);
  const selection = validateNotificationPreferenceSelection({
    ...value,
    profileRevision: integer(field(value, "profileRevision"), 1),
  });
  if (!selection) throw new TypeError();
  return selection;
}

function commandFromForm(formData: FormData) {
  const value = exactForm(formData, [
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
  ]);
  const eventTypes = json(field(value, "eventTypes"));
  const quietHours = json(field(value, "quietHours"));
  const command = validateNotificationPreferenceCommand({
    ...value,
    profileRevision: integer(field(value, "profileRevision"), 1),
    preferenceRevision: integer(field(value, "preferenceRevision"), 0),
    consent:
      value.consent === "true"
        ? true
        : value.consent === "false"
          ? false
          : null,
    eventTypes,
    leadMinutes: integer(field(value, "leadMinutes"), 0),
    quietHours,
  });
  if (!command) throw new TypeError();
  return command;
}

function exactForm(formData: FormData, keys: readonly string[]) {
  if (!(formData instanceof FormData)) throw new TypeError();
  const entries = [...formData.entries()].filter(
    ([key]) => !key.startsWith("$ACTION_"),
  );
  if (
    entries.length !== keys.length ||
    entries.some(
      (entry, index) =>
        entry[0] !== keys[index] || typeof entry[1] !== "string",
    )
  )
    throw new TypeError();
  return Object.fromEntries(entries) as Record<string, string>;
}

function integer(value: string, minimum: number) {
  if (!/^\d{1,9}$/.test(value)) throw new TypeError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new TypeError();
  return parsed;
}

function field(value: Record<string, string>, key: string) {
  const result = value[key];
  if (result === undefined) throw new TypeError();
  return result;
}

function json(value: string) {
  if (Buffer.byteLength(value, "utf8") > MAX_JSON_BYTES) throw new TypeError();
  return JSON.parse(value) as unknown;
}

function internalRequest(
  headersValue: Pick<Headers, "get">,
  origin: string,
  operation: "load" | "replace",
) {
  if (!headersValue || typeof headersValue.get !== "function")
    throw new TypeError();
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new TypeError();
  const cookie = headersValue.get("cookie");
  if (
    cookie !== null &&
    (Buffer.byteLength(cookie, "utf8") > MAX_COOKIE_BYTES ||
      /[\0\r\n]/.test(cookie))
  )
    throw new TypeError();
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(
    `${origin}/internal/notification-preferences/${operation}`,
    { method: "POST", headers },
  );
}

function project(
  value: NotificationPreferenceResponse,
): NotificationPreferenceActionState {
  if (
    !record(value) ||
    value.version !== NOTIFICATION_PREFERENCE_CONTRACT_VERSION
  )
    return state("retry");
  if (value.disposition === "ready") {
    if (
      !exact(value, ["version", "disposition", "view", "materialization"]) ||
      !validView(value.view) ||
      !validMaterialization(value.materialization)
    )
      return state("retry");
    return Object.freeze({
      status: "ready",
      view: value.view,
      materialization: value.materialization,
    });
  }
  if (
    !exact(value, ["version", "disposition"]) ||
    ![
      "authenticate",
      "authorize",
      "locked",
      "conflict",
      "unavailable",
      "retry",
    ].includes(value.disposition)
  )
    return state("retry");
  return state(value.disposition);
}

function validView(value: unknown) {
  if (
    !record(value) ||
    !exact(value, [
      "version",
      "profileId",
      "birthProfileId",
      "profileRevision",
      "preferenceRevision",
      "displayName",
      "channel",
      "channelAvailability",
      "consent",
      "eventTypes",
      "leadMinutes",
      "quietHours",
      "timezone",
      "deliveries",
    ]) ||
    value.version !== NOTIFICATION_PREFERENCE_CONTRACT_VERSION ||
    !uuid(value.profileId) ||
    !uuid(value.birthProfileId) ||
    !positiveInteger(value.profileRevision) ||
    !nonnegativeInteger(value.preferenceRevision) ||
    typeof value.displayName !== "string" ||
    value.displayName.length < 1 ||
    value.displayName.length > 80 ||
    value.channel !== "email" ||
    value.channelAvailability !== "provider-unavailable" ||
    typeof value.consent !== "boolean" ||
    !validEventTypes(value.eventTypes) ||
    !NOTIFICATION_LEAD_MINUTES.includes(value.leadMinutes as never) ||
    !validQuietHours(value.quietHours) ||
    typeof value.timezone !== "string" ||
    value.timezone.length < 1 ||
    value.timezone.length > 128 ||
    !Array.isArray(value.deliveries) ||
    value.deliveries.length > 20 ||
    !value.deliveries.every(validDelivery)
  )
    return false;
  return value.consent === value.eventTypes.length > 0;
}

function validEventTypes(value: unknown): value is NotificationEventType[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item, index) =>
        typeof item === "string" &&
        NOTIFICATION_EVENT_TYPES[indexOfEvent(item)] === item &&
        (index === 0 || indexOfEvent(value[index - 1]) < indexOfEvent(item)),
    )
  );
}

function validDelivery(value: unknown) {
  return (
    record(value) &&
    exact(value, [
      "eventType",
      "eventOccursAt",
      "scheduledAt",
      "status",
      "attemptCount",
    ]) &&
    indexOfEvent(value.eventType) >= 0 &&
    canonicalInstant(value.eventOccursAt) &&
    canonicalInstant(value.scheduledAt) &&
    [
      "pending-provider",
      "queued",
      "sent",
      "failed",
      "stale",
      "canceled",
    ].includes(value.status as string) &&
    nonnegativeInteger(value.attemptCount) &&
    value.attemptCount <= 100
  );
}

function validMaterialization(value: unknown) {
  if (value === null) return true;
  return (
    record(value) &&
    exact(value, [
      "status",
      "inserted",
      "existing",
      "invalidated",
      "skippedPast",
      "deliveryProvider",
    ]) &&
    ["prepared", "calculation-unavailable"].includes(value.status as string) &&
    nonnegativeInteger(value.inserted) &&
    nonnegativeInteger(value.existing) &&
    nonnegativeInteger(value.invalidated) &&
    nonnegativeInteger(value.skippedPast) &&
    value.deliveryProvider === "unavailable"
  );
}

function validQuietHours(value: unknown) {
  return (
    value === null ||
    (record(value) &&
      exact(value, ["start", "end"]) &&
      clock(value.start) &&
      clock(value.end) &&
      value.start !== value.end)
  );
}

function indexOfEvent(value: unknown) {
  return typeof value === "string"
    ? NOTIFICATION_EVENT_TYPES.indexOf(value as never)
    : -1;
}

function positiveInteger(value: unknown) {
  return nonnegativeInteger(value) && value > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function uuid(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function clock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function canonicalInstant(value: unknown) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function state(
  status: Exclude<
    NotificationPreferenceActionState,
    { status: "ready" } | { status: "idle" } | { status: "loading" }
  >["status"],
): NotificationPreferenceActionState {
  const messages = {
    authenticate: "Sign in again before managing private alert preferences.",
    authorize: "That saved profile could not be authorized.",
    locked: "Your current plan does not include alerts.",
    conflict:
      "These preferences or the profile changed. Reload before saving again.",
    unavailable: "Validated timeline facts are temporarily unavailable.",
    retry:
      "Alert preferences could not be loaded. No private data was exposed.",
  } as const;
  return Object.freeze({ status, message: messages[status] });
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
