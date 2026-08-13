import "server-only";

import type { PersonalTimelineActionState } from "@/presentation/personal-timeline-state";
import type { PersonalTimelineResponse } from "@/server/authenticated-personal-timeline";
import {
  PERSONAL_TIMELINE_CONTRACT_VERSION,
  validatePersonalTimelineCommand,
  type PersonalTimelineCommand,
} from "@/server/personal-timeline-contracts";

const MAX_COOKIE_BYTES = 8_192;

export interface PersonalTimelineService {
  readonly canonicalOrigin: string;
  loadPersonalTimeline(
    request: Request,
    command: PersonalTimelineCommand,
  ): Promise<PersonalTimelineResponse>;
}

export async function loadPersonalTimelineFromForm(
  requestHeaders: Pick<Headers, "get">,
  formData: FormData,
  getService: () => PersonalTimelineService,
): Promise<PersonalTimelineActionState> {
  let command: PersonalTimelineCommand;
  try {
    command = commandFromForm(formData);
  } catch {
    return state("authorize");
  }
  try {
    const service = getService();
    const value = await service.loadPersonalTimeline(
      internalRequest(requestHeaders, service.canonicalOrigin),
      command,
    );
    if (!record(value) || value.version !== PERSONAL_TIMELINE_CONTRACT_VERSION)
      return state("retry");
    if (value.disposition === "ready") {
      if (
        !exact(value, [
          "version",
          "disposition",
          "model",
          "scope",
          "truncated",
        ]) ||
        !record(value.model) ||
        (value.scope !== "forecast" &&
          value.scope !== "full-transit-calendar") ||
        typeof value.truncated !== "boolean"
      )
        return state("retry");
      return Object.freeze({
        status: "ready",
        model: value.model,
        scope: value.scope,
        truncated: value.truncated,
      });
    }
    if (
      !exact(value, ["version", "disposition"]) ||
      ![
        "authenticate",
        "authorize",
        "locked",
        "conflict",
        "incomplete",
        "stale",
        "unavailable",
        "retry",
      ].includes(value.disposition)
    )
      return state("retry");
    return state(value.disposition);
  } catch {
    return state("retry");
  }
}

function commandFromForm(formData: FormData): PersonalTimelineCommand {
  if (!(formData instanceof FormData)) throw new TypeError();
  const entries = [...formData.entries()].filter(
    ([key]) => !key.startsWith("$ACTION_"),
  );
  const keys = ["version", "profileId", "birthProfileId", "revision"];
  if (
    entries.length !== keys.length ||
    entries.some(
      (entry, index) =>
        entry[0] !== keys[index] || typeof entry[1] !== "string",
    )
  )
    throw new TypeError();
  const value = Object.fromEntries(entries);
  if (
    typeof value.revision !== "string" ||
    !/^[1-9]\d{0,8}$/.test(value.revision)
  )
    throw new TypeError();
  const command = validatePersonalTimelineCommand({
    ...value,
    revision: Number(value.revision),
  });
  if (!command) throw new TypeError();
  return command;
}

function internalRequest(headersValue: Pick<Headers, "get">, origin: string) {
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
  return new Request(`${origin}/internal/personal-timeline`, {
    method: "POST",
    headers,
  });
}

function state(
  status: Exclude<
    PersonalTimelineActionState,
    { status: "ready" } | { status: "idle" } | { status: "loading" }
  >["status"],
): PersonalTimelineActionState {
  const messages = {
    authenticate: "Sign in again before loading this private timeline.",
    authorize: "That saved profile could not be authorized.",
    locked: "Your current plan does not include a personal forecast timeline.",
    conflict: "The profile changed. Refresh before loading the timeline again.",
    incomplete: "Generate a natal chart for this profile first.",
    stale:
      "The saved natal chart is stale. Regenerate it from the current profile.",
    unavailable: "Validated upcoming sky facts are temporarily unavailable.",
    retry:
      "The private timeline could not be loaded. No private data was exposed.",
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
