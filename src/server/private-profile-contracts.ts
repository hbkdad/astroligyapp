import "server-only";

import type {
  PrivateProfilePrecision,
  PrivateProfileView,
} from "@/presentation/private-profile-state";

export type {
  PrivateProfilePrecision,
  PrivateProfileView,
} from "@/presentation/private-profile-state";

export const PRIVATE_PROFILE_CONTRACT_VERSION = "1.0.0";
export const PRIVATE_PROFILE_PRECISIONS = [
  "date-only",
  "approximate",
  "exact",
] as const;

export type PrivateProfileWrite = Readonly<{
  displayName: string;
  currentTimezone: string;
  birthDate: string;
  birthTimePrecision: PrivateProfilePrecision;
  birthTimeLocal: string | null;
  birthTimezone: string;
  latitude: number | null;
  longitude: number | null;
}>;

export type PrivateProfileCommand =
  | Readonly<{
      version: typeof PRIVATE_PROFILE_CONTRACT_VERSION;
      operation: "create";
      value: PrivateProfileWrite;
    }>
  | Readonly<{
      version: typeof PRIVATE_PROFILE_CONTRACT_VERSION;
      operation: "update";
      profileId: string;
      birthProfileId: string;
      revision: number;
      value: PrivateProfileWrite;
    }>
  | Readonly<{
      version: typeof PRIVATE_PROFILE_CONTRACT_VERSION;
      operation: "delete";
      profileId: string;
      birthProfileId: string;
      revision: number;
    }>;

export function validatePrivateProfileWrite(
  value: unknown,
  now: Date = new Date(),
): PrivateProfileWrite | null {
  if (
    !record(value) ||
    !exactKeys(value, [
      "displayName",
      "currentTimezone",
      "birthDate",
      "birthTimePrecision",
      "birthTimeLocal",
      "birthTimezone",
      "latitude",
      "longitude",
    ]) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  )
    return null;
  const displayName = normalizedName(value.displayName);
  const currentTimezone = timezone(value.currentTimezone);
  const birthTimezone = timezone(value.birthTimezone);
  const birthDate = date(value.birthDate, now);
  const precision = value.birthTimePrecision;
  const birthTimeLocal = value.birthTimeLocal;
  const latitude = coordinate(value.latitude, -90, 90);
  const longitude = coordinate(value.longitude, -180, 180);
  if (
    !displayName ||
    !currentTimezone ||
    !birthTimezone ||
    !birthDate ||
    !PRIVATE_PROFILE_PRECISIONS.includes(
      precision as PrivateProfilePrecision,
    ) ||
    !validTime(precision, birthTimeLocal) ||
    latitude === undefined ||
    longitude === undefined ||
    (latitude === null) !== (longitude === null)
  )
    return null;
  return deepFreeze({
    displayName,
    currentTimezone,
    birthDate,
    birthTimePrecision: precision as PrivateProfilePrecision,
    birthTimeLocal: birthTimeLocal as string | null,
    birthTimezone,
    latitude,
    longitude,
  });
}

export function validatePrivateProfileCommand(
  value: unknown,
  now: Date = new Date(),
): PrivateProfileCommand | null {
  if (!record(value) || value.version !== PRIVATE_PROFILE_CONTRACT_VERSION)
    return null;
  if (
    value.operation === "create" &&
    exactKeys(value, ["version", "operation", "value"])
  ) {
    const write = validatePrivateProfileWrite(value.value, now);
    return write
      ? deepFreeze({
          version: PRIVATE_PROFILE_CONTRACT_VERSION,
          operation: "create" as const,
          value: write,
        })
      : null;
  }
  if (
    value.operation === "update" &&
    exactKeys(value, [
      "version",
      "operation",
      "profileId",
      "birthProfileId",
      "revision",
      "value",
    ]) &&
    uuid(value.profileId) &&
    uuid(value.birthProfileId) &&
    revision(value.revision)
  ) {
    const write = validatePrivateProfileWrite(value.value, now);
    return write
      ? deepFreeze({
          version: PRIVATE_PROFILE_CONTRACT_VERSION,
          operation: "update" as const,
          profileId: value.profileId,
          birthProfileId: value.birthProfileId,
          revision: value.revision,
          value: write,
        })
      : null;
  }
  if (
    value.operation === "delete" &&
    exactKeys(value, [
      "version",
      "operation",
      "profileId",
      "birthProfileId",
      "revision",
    ]) &&
    uuid(value.profileId) &&
    uuid(value.birthProfileId) &&
    revision(value.revision)
  )
    return deepFreeze({
      version: PRIVATE_PROFILE_CONTRACT_VERSION,
      operation: "delete" as const,
      profileId: value.profileId,
      birthProfileId: value.birthProfileId,
      revision: value.revision,
    });
  return null;
}

export function validatePrivateProfileView(
  value: unknown,
): PrivateProfileView | null {
  if (
    !record(value) ||
    !exactKeys(value, [
      "profileId",
      "birthProfileId",
      "revision",
      "displayName",
      "currentTimezone",
      "birthDate",
      "birthTimePrecision",
      "birthTimeLocal",
      "birthTimezone",
      "latitude",
      "longitude",
    ]) ||
    !uuid(value.profileId) ||
    !uuid(value.birthProfileId) ||
    !revision(value.revision)
  )
    return null;
  const write = validatePrivateProfileWrite(
    {
      displayName: value.displayName,
      currentTimezone: value.currentTimezone,
      birthDate: value.birthDate,
      birthTimePrecision: value.birthTimePrecision,
      birthTimeLocal: value.birthTimeLocal,
      birthTimezone: value.birthTimezone,
      latitude: value.latitude,
      longitude: value.longitude,
    },
    new Date("9999-12-31T23:59:59.999Z"),
  );
  return write
    ? deepFreeze({
        profileId: value.profileId,
        birthProfileId: value.birthProfileId,
        revision: value.revision,
        ...write,
      })
    : null;
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  return normalized.length >= 1 &&
    normalized.length <= 80 &&
    !/[\p{Cc}\p{Cf}]/u.test(normalized)
    ? normalized
    : null;
}

function timezone(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    /[\0\r\n]/.test(value)
  )
    return null;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(0);
    return value;
  } catch {
    return null;
  }
}

function date(value: unknown, now: Date): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < "1800-01-01" ||
    value > now.toISOString().slice(0, 10)
  )
    return null;
  return value;
}

function validTime(precision: unknown, value: unknown): boolean {
  return precision === "date-only"
    ? value === null
    : (precision === "exact" || precision === "approximate") &&
        typeof value === "string" &&
        /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

function coordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum &&
    Math.round(value * 1_000_000) === value * 1_000_000
    ? value
    : undefined;
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
