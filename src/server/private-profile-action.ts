import "server-only";

import type {
  PrivateProfileMutationResult,
  PrivateProfileReadResult,
} from "@/server/authenticated-private-profiles";
import {
  type PrivateProfileActionState,
  type PrivateProfileView,
} from "@/presentation/private-profile-state";
import {
  PRIVATE_PROFILE_CONTRACT_VERSION,
  validatePrivateProfileCommand,
  validatePrivateProfileView,
  type PrivateProfileCommand,
} from "@/server/private-profile-contracts";

const MAX_COOKIE_BYTES = 8_192;

export type PrivateProfilePageState =
  | Readonly<{
      status: "ready";
      profiles: readonly PrivateProfileView[];
      multipleProfilesAllowed: boolean;
    }>
  | Readonly<{ status: "authenticate" | "retry" }>;

export type { PrivateProfileActionState } from "@/presentation/private-profile-state";
export { INITIAL_PRIVATE_PROFILE_ACTION_STATE } from "@/presentation/private-profile-state";

export interface PrivateProfileService {
  readonly canonicalOrigin: string;
  loadPrivateProfiles(request: Request): Promise<PrivateProfileReadResult>;
  mutatePrivateProfile(
    request: Request,
    command: PrivateProfileCommand,
  ): Promise<PrivateProfileMutationResult>;
}

export async function loadPrivateProfilesFromHeaders(
  requestHeaders: Pick<Headers, "get">,
  getService: () => PrivateProfileService,
): Promise<PrivateProfilePageState> {
  try {
    const service = getService();
    const request = internalRequest(
      requestHeaders,
      service.canonicalOrigin,
      "/internal/private-profiles",
      "GET",
    );
    return projectRead(await service.loadPrivateProfiles(request));
  } catch {
    return Object.freeze({ status: "retry" });
  }
}

export async function mutatePrivateProfileFromForm(
  requestHeaders: Pick<Headers, "get">,
  formData: FormData,
  getService: () => PrivateProfileService,
): Promise<PrivateProfileActionState> {
  let command: PrivateProfileCommand;
  try {
    command = commandFromForm(formData);
  } catch {
    return actionState("authorize");
  }
  try {
    const service = getService();
    const request = internalRequest(
      requestHeaders,
      service.canonicalOrigin,
      "/internal/private-profile-mutation",
      "POST",
    );
    return projectMutation(
      await service.mutatePrivateProfile(request, command),
    );
  } catch {
    return actionState("retry");
  }
}

function commandFromForm(formData: FormData): PrivateProfileCommand {
  if (!(formData instanceof FormData)) invalid();
  const entries = [...formData.entries()].filter(
    ([key]) => !key.startsWith("$ACTION_"),
  );
  if (entries.some(([, value]) => typeof value !== "string")) invalid();
  const object = Object.fromEntries(entries) as Record<string, string>;
  if (object.version !== PRIVATE_PROFILE_CONTRACT_VERSION) invalid();
  if (object.operation === "create") {
    exact(entries, [
      "version",
      "operation",
      "displayName",
      "birthName",
      "currentTimezone",
      "birthDate",
      "birthTimePrecision",
      "birthTimeLocal",
      "birthTimezone",
      "latitude",
      "longitude",
    ]);
    return validatedCommand({
      version: PRIVATE_PROFILE_CONTRACT_VERSION,
      operation: "create",
      value: write(object),
    });
  }
  if (object.operation === "update") {
    exact(entries, [
      "version",
      "operation",
      "profileId",
      "birthProfileId",
      "revision",
      "displayName",
      "birthName",
      "currentTimezone",
      "birthDate",
      "birthTimePrecision",
      "birthTimeLocal",
      "birthTimezone",
      "latitude",
      "longitude",
    ]);
    return validatedCommand({
      version: PRIVATE_PROFILE_CONTRACT_VERSION,
      operation: "update",
      profileId: object.profileId!,
      birthProfileId: object.birthProfileId!,
      revision: integer(object.revision),
      value: write(object),
    });
  }
  if (object.operation === "delete") {
    exact(entries, [
      "version",
      "operation",
      "profileId",
      "birthProfileId",
      "revision",
      "confirmation",
    ]);
    if (object.confirmation !== "DELETE PROFILE") invalid();
    return validatedCommand({
      version: PRIVATE_PROFILE_CONTRACT_VERSION,
      operation: "delete",
      profileId: object.profileId!,
      birthProfileId: object.birthProfileId!,
      revision: integer(object.revision),
    });
  }
  invalid();
}

function validatedCommand(value: unknown): PrivateProfileCommand {
  const command = validatePrivateProfileCommand(value);
  if (!command) invalid();
  return command;
}

function write(object: Record<string, string>) {
  const precision = object.birthTimePrecision;
  return Object.freeze({
    displayName: object.displayName!,
    birthName: object.birthName === "" ? null : object.birthName!,
    currentTimezone: object.currentTimezone!,
    birthDate: object.birthDate!,
    birthTimePrecision: precision as "date-only" | "approximate" | "exact",
    birthTimeLocal: precision === "date-only" ? null : object.birthTimeLocal!,
    birthTimezone: object.birthTimezone!,
    latitude: decimal(object.latitude),
    longitude: decimal(object.longitude),
  });
}

function internalRequest(
  requestHeaders: Pick<Headers, "get">,
  originValue: unknown,
  path: string,
  method: "GET" | "POST",
) {
  const origin = canonicalOrigin(originValue);
  const cookie = boundedCookie(requestHeaders);
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${origin}${path}`, { method, headers });
}

function projectRead(value: unknown): PrivateProfilePageState {
  if (!record(value) || value.version !== PRIVATE_PROFILE_CONTRACT_VERSION)
    return Object.freeze({ status: "retry" });
  if (
    value.disposition === "ready" &&
    exactObject(value, [
      "version",
      "disposition",
      "profiles",
      "multipleProfilesAllowed",
    ]) &&
    Array.isArray(value.profiles) &&
    typeof value.multipleProfilesAllowed === "boolean"
  ) {
    const profiles = value.profiles.map(validatePrivateProfileView);
    if (profiles.some((profile) => profile === null))
      return Object.freeze({ status: "retry" });
    return Object.freeze({
      status: "ready" as const,
      profiles: Object.freeze(profiles as PrivateProfileView[]),
      multipleProfilesAllowed: value.multipleProfilesAllowed,
    });
  }
  if (
    (value.disposition === "authenticate" || value.disposition === "retry") &&
    exactObject(value, ["version", "disposition"])
  )
    return Object.freeze({ status: value.disposition });
  return Object.freeze({ status: "retry" });
}

function projectMutation(value: unknown): PrivateProfileActionState {
  if (
    !record(value) ||
    !exactObject(value, ["version", "disposition"]) ||
    value.version !== PRIVATE_PROFILE_CONTRACT_VERSION ||
    ![
      "saved",
      "deleted",
      "authenticate",
      "authorize",
      "limit",
      "conflict",
      "retry",
    ].includes(value.disposition as string)
  )
    return actionState("retry");
  return actionState(value.disposition as PrivateProfileActionState["status"]);
}

function boundedCookie(requestHeaders: Pick<Headers, "get">) {
  if (!requestHeaders || typeof requestHeaders.get !== "function") invalid();
  const cookie = requestHeaders.get("cookie");
  if (cookie === null) return null;
  if (
    typeof cookie !== "string" ||
    Buffer.byteLength(cookie, "utf8") > MAX_COOKIE_BYTES ||
    /[\0\r\n]/.test(cookie)
  )
    invalid();
  return cookie;
}

function canonicalOrigin(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) invalid();
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.origin !== value ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    invalid();
  return value;
}

function exact(entries: [string, FormDataEntryValue][], keys: string[]) {
  if (
    entries.length !== keys.length ||
    entries.some(([key], index) => key !== keys[index])
  )
    invalid();
}

function integer(value: string | undefined) {
  if (!value || !/^[1-9]\d{0,8}$/.test(value)) invalid();
  return Number(value);
}

function decimal(value: string | undefined): number | null {
  if (value === "") return null;
  if (!value || !/^-?\d{1,3}(?:\.\d{1,6})?$/.test(value)) invalid();
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) invalid();
  return parsed;
}

function actionState(
  status: PrivateProfileActionState["status"],
): PrivateProfileActionState {
  return Object.freeze({ status });
}

function exactObject(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new TypeError("Invalid private profile action input");
}
