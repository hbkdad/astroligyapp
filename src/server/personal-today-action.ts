import "server-only";

import type { PersonalTodayActionState } from "@/presentation/personal-today-state";
import type { PersonalTodayResponse } from "@/server/authenticated-personal-today";
import {
  PERSONAL_TODAY_CONTRACT_VERSION,
  validatePersonalTodayCommand,
  type PersonalTodayCommand,
} from "@/server/personal-today-contracts";

const MAX_COOKIE_BYTES = 8_192;

export interface PersonalTodayService {
  readonly canonicalOrigin: string;
  loadPersonalToday(
    request: Request,
    command: PersonalTodayCommand,
  ): Promise<PersonalTodayResponse>;
}

export async function loadPersonalTodayFromForm(
  requestHeaders: Pick<Headers, "get">,
  formData: FormData,
  getService: () => PersonalTodayService,
): Promise<PersonalTodayActionState> {
  let command: PersonalTodayCommand;
  try {
    command = commandFromForm(formData);
  } catch {
    return state("authorize");
  }
  try {
    const service = getService();
    const value = await service.loadPersonalToday(
      internalRequest(requestHeaders, service.canonicalOrigin),
      command,
    );
    if (
      !record(value) ||
      value.version !== PERSONAL_TODAY_CONTRACT_VERSION ||
      ![
        "ready",
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
    if (value.disposition === "ready") {
      if (
        !exact(value, ["version", "disposition", "model"]) ||
        !record(value.model)
      )
        return state("retry");
      return Object.freeze({ status: "ready", model: value.model });
    }
    if (!exact(value, ["version", "disposition"])) return state("retry");
    return state(value.disposition);
  } catch {
    return state("retry");
  }
}

function commandFromForm(formData: FormData): PersonalTodayCommand {
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
  const command = validatePersonalTodayCommand({
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
  return new Request(`${origin}/internal/personal-today`, {
    method: "POST",
    headers,
  });
}

function state(
  status: Exclude<
    PersonalTodayActionState,
    { status: "ready" } | { status: "idle" } | { status: "loading" }
  >["status"],
): PersonalTodayActionState {
  const messages = {
    authenticate: "Sign in again before loading private daily context.",
    authorize: "That saved profile could not be authorized.",
    locked:
      "Your current plan does not include personalized daily readings and personal transits.",
    conflict: "The profile changed. Refresh before loading Today again.",
    incomplete:
      "Add a supported full birth name and generate a natal chart before loading Today.",
    stale:
      "Your saved natal chart is stale. Regenerate it from the current profile first.",
    unavailable: "Validated current sky facts are temporarily unavailable.",
    retry:
      "The private dashboard could not be loaded. No private data was exposed.",
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
