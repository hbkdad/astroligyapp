import "server-only";

import type { ProtectedNatalChartActionState } from "@/presentation/protected-natal-chart-state";
import type { ProtectedNatalChartProfileView } from "@/presentation/protected-natal-chart-state";
import type {
  ProtectedNatalMutationResult,
  ProtectedNatalReadResult,
} from "@/server/authenticated-protected-natal-chart";
import {
  PROTECTED_NATAL_CHART_CONTRACT_VERSION,
  validateProtectedNatalChartCommand,
  validateProtectedNatalChartProfileView,
  type ProtectedNatalChartCommand,
} from "@/server/protected-natal-chart-contracts";

const MAX_COOKIE_BYTES = 8_192;

export interface ProtectedNatalChartService {
  readonly canonicalOrigin: string;
  generateProtectedNatalChart(
    request: Request,
    command: ProtectedNatalChartCommand,
  ): Promise<ProtectedNatalMutationResult>;
  loadProtectedNatalCharts(request: Request): Promise<ProtectedNatalReadResult>;
}

export type ProtectedNatalChartPageState =
  | Readonly<{
      status: "ready";
      profiles: readonly ProtectedNatalChartProfileView[];
    }>
  | Readonly<{ status: "authenticate" | "retry" }>;

export async function loadProtectedNatalChartsFromHeaders(
  requestHeaders: Pick<Headers, "get">,
  getService: () => ProtectedNatalChartService,
): Promise<ProtectedNatalChartPageState> {
  try {
    const service = getService();
    const value = await service.loadProtectedNatalCharts(
      internalRequest(requestHeaders, service.canonicalOrigin, "GET"),
    );
    if (
      !record(value) ||
      value.version !== PROTECTED_NATAL_CHART_CONTRACT_VERSION
    )
      return Object.freeze({ status: "retry" });
    if (
      (value.disposition === "authenticate" || value.disposition === "retry") &&
      Object.keys(value).length === 2
    )
      return Object.freeze({ status: value.disposition });
    if (
      value.disposition !== "ready" ||
      Object.keys(value).length !== 3 ||
      !Array.isArray(value.profiles)
    )
      return Object.freeze({ status: "retry" });
    const profiles = value.profiles.map(validateProtectedNatalChartProfileView);
    if (profiles.some((profile) => profile === null))
      return Object.freeze({ status: "retry" });
    return Object.freeze({
      status: "ready" as const,
      profiles: Object.freeze(profiles as ProtectedNatalChartProfileView[]),
    });
  } catch {
    return Object.freeze({ status: "retry" });
  }
}

export async function generateProtectedNatalChartFromForm(
  requestHeaders: Pick<Headers, "get">,
  formData: FormData,
  getService: () => ProtectedNatalChartService,
): Promise<ProtectedNatalChartActionState> {
  let command: ProtectedNatalChartCommand;
  try {
    command = commandFromForm(formData);
  } catch {
    return state("authorize");
  }
  try {
    const service = getService();
    const request = internalRequest(
      requestHeaders,
      service.canonicalOrigin,
      "POST",
    );
    return project(await service.generateProtectedNatalChart(request, command));
  } catch {
    return state("retry");
  }
}

function commandFromForm(formData: FormData): ProtectedNatalChartCommand {
  if (!(formData instanceof FormData)) invalid();
  const entries = [...formData.entries()].filter(
    ([key]) => !key.startsWith("$ACTION_"),
  );
  if (
    entries.length !== 4 ||
    entries.some(([, value]) => typeof value !== "string") ||
    entries.some(
      ([key], index) =>
        key !== ["version", "profileId", "birthProfileId", "revision"][index],
    )
  )
    invalid();
  const value = Object.fromEntries(entries);
  if (
    typeof value.revision !== "string" ||
    !/^[1-9]\d{0,8}$/.test(value.revision)
  )
    invalid();
  const command = validateProtectedNatalChartCommand({
    version: value.version,
    profileId: value.profileId,
    birthProfileId: value.birthProfileId,
    revision: Number(value.revision),
  });
  if (!command) invalid();
  return command;
}

function internalRequest(
  headersValue: Pick<Headers, "get">,
  originValue: unknown,
  method: "GET" | "POST",
): Request {
  if (!headersValue || typeof headersValue.get !== "function") invalid();
  if (typeof originValue !== "string" || originValue.length > 2_048) invalid();
  const url = new URL(originValue);
  if (
    url.protocol !== "https:" ||
    url.origin !== originValue ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    invalid();
  const cookie = headersValue.get("cookie");
  if (
    cookie !== null &&
    (Buffer.byteLength(cookie, "utf8") > MAX_COOKIE_BYTES ||
      /[\0\r\n]/.test(cookie))
  )
    invalid();
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${originValue}/internal/protected-natal-chart`, {
    method,
    headers,
  });
}

function project(value: unknown): ProtectedNatalChartActionState {
  if (
    !record(value) ||
    Object.keys(value).length !== 2 ||
    value.version !== PROTECTED_NATAL_CHART_CONTRACT_VERSION ||
    ![
      "generated",
      "cached",
      "authenticate",
      "authorize",
      "locked",
      "conflict",
      "date-only",
      "coordinates-missing",
      "ambiguous-time",
      "nonexistent-time",
      "unavailable",
      "retry",
    ].includes(value.disposition as string)
  )
    return state("retry");
  return state(
    value.disposition as ProtectedNatalChartActionState["disposition"],
  );
}

function state(
  disposition: ProtectedNatalChartActionState["disposition"],
): ProtectedNatalChartActionState {
  return Object.freeze({ disposition });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new TypeError("Invalid protected natal chart action input");
}
