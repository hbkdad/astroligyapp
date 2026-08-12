import "server-only";

import { loadBetterAuthConfiguration } from "@/server/better-auth-configuration";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";

const MAXIMUM_BODY_BYTES = 4 * 1024;
const MAXIMUM_HEADERS = 64;
const MAXIMUM_HEADER_NAME_LENGTH = 128;
const MAXIMUM_HEADER_VALUE_LENGTH = 8 * 1024;

const POST_PATHS = new Set([
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/email",
  "/api/auth/request-password-reset",
  "/api/auth/send-verification-email",
  "/api/auth/reset-password",
  "/api/auth/sign-out",
]);

export const BETTER_AUTH_HTTP_RESPONSE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
});

export interface BetterAuthHttpService {
  handle(request: Request): Promise<Response>;
}

type BetterAuthHttpServiceProvider = () => BetterAuthHttpService;

export function createBetterAuthHttpHandler(
  canonicalOriginValue: unknown,
  getService: BetterAuthHttpServiceProvider,
) {
  const canonicalOrigin = exactOrigin(canonicalOriginValue);
  if (typeof getService !== "function") configurationInvalid();

  return async function handle(request: Request): Promise<Response> {
    const allowedMethod = allowedMethodForUrl(request.url, canonicalOrigin);
    if (allowedMethod && request.method !== allowedMethod)
      return safeResponse(
        405,
        "method-not-allowed",
        { Allow: allowedMethod },
        request.method === "HEAD",
      );
    let prepared: Request | null;
    try {
      prepared = await prepareRequest(request, canonicalOrigin);
    } catch {
      return safeResponse(400, "rejected");
    }
    if (!prepared) return safeResponse(404, "not-found");

    let response: Response;
    try {
      response = await getService().handle(prepared);
      if (!(response instanceof Response)) throw new TypeError();
    } catch {
      return safeResponse(503, "unavailable");
    }
    return await secureResponse(
      response,
      canonicalOrigin,
      new URL(prepared.url).pathname,
    );
  };
}

function allowedMethodForUrl(
  requestUrl: string,
  canonicalOrigin: string,
): "GET" | "POST" | null {
  try {
    const url = new URL(requestUrl);
    if (url.origin !== canonicalOrigin) return null;
    if (POST_PATHS.has(url.pathname)) return "POST";
    return getEndpoint(url) ? "GET" : null;
  } catch {
    return null;
  }
}

export function createProductionBetterAuthHttpHandler() {
  return createLazyBetterAuthHttpHandler(
    () => loadBetterAuthConfiguration(process.env).baseUrl,
    productionBetterAuthHttpService,
  );
}

export function createLazyBetterAuthHttpHandler(
  loadCanonicalOrigin: () => string,
  getService: BetterAuthHttpServiceProvider,
) {
  let handler: ReturnType<typeof createBetterAuthHttpHandler> | undefined;
  return async function handle(request: Request): Promise<Response> {
    try {
      handler ??= createBetterAuthHttpHandler(
        loadCanonicalOrigin(),
        getService,
      );
      return await handler(request);
    } catch {
      return safeResponse(503, "unavailable");
    }
  };
}

async function prepareRequest(
  request: Request,
  canonicalOrigin: string,
): Promise<Request | null> {
  if (!(request instanceof Request) || !boundedHeaders(request.headers))
    invalid();
  const url = new URL(request.url);
  if (
    url.origin !== canonicalOrigin ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    request.headers.has("authorization") ||
    request.headers.has("x-http-method-override")
  )
    invalid();

  const getKind = getEndpoint(url);
  const isPost = POST_PATHS.has(url.pathname);
  if (!getKind && !isPost) return null;
  if (request.method !== (isPost ? "POST" : "GET")) return null;

  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (isPost || getKind === "session") {
    if (
      site !== "same-origin" ||
      (origin !== null && origin !== canonicalOrigin)
    )
      invalid();
    if (isPost && origin !== canonicalOrigin) invalid();
  } else if (origin !== null && origin !== canonicalOrigin) {
    invalid();
  } else if (
    site !== null &&
    site !== "none" &&
    site !== "same-origin" &&
    site !== "cross-site"
  ) {
    invalid();
  }

  if (getKind) {
    validateGet(url, getKind, canonicalOrigin);
    return clonedRequest(request, undefined);
  }

  if (url.search) invalid();
  if (url.pathname === "/api/auth/sign-out") {
    const body = await readBoundedBody(request, true);
    if (body.byteLength !== 0) invalid();
    return clonedRequest(request, undefined);
  }
  if (request.headers.get("content-type") !== "application/json") invalid();
  const body = await readBoundedBody(request, false);
  validatePost(url.pathname, parseJson(body), canonicalOrigin);
  return clonedRequest(request, body);
}

function getEndpoint(url: URL): "session" | "verify" | "reset" | null {
  if (url.pathname === "/api/auth/get-session") return "session";
  if (url.pathname === "/api/auth/verify-email") return "verify";
  if (/^\/api\/auth\/reset-password\/[A-Za-z0-9_-]{24}$/.test(url.pathname))
    return "reset";
  return null;
}

function validateGet(
  url: URL,
  kind: "session" | "verify" | "reset",
  canonicalOrigin: string,
): void {
  const entries = [...url.searchParams.entries()];
  if (kind === "session") {
    if (entries.length !== 0) invalid();
    return;
  }
  if (kind === "verify") {
    if (
      !exactQuery(entries, ["token", "callbackURL"]) ||
      !verificationToken(url.searchParams.get("token")) ||
      !callbackPath(url.searchParams.get("callbackURL"), canonicalOrigin)
    )
      invalid();
    return;
  }
  if (
    !exactQuery(entries, ["callbackURL"]) ||
    !callbackPath(url.searchParams.get("callbackURL"), canonicalOrigin)
  )
    invalid();
}

function validatePost(path: string, value: unknown, canonicalOrigin: string) {
  if (!record(value)) invalid();
  if (path === "/api/auth/sign-up/email") {
    if (
      !onlyKeys(
        value,
        ["name", "email", "password"],
        ["callbackURL", "rememberMe"],
      ) ||
      !safeName(value.name) ||
      !safeEmail(value.email) ||
      !safePassword(value.password) ||
      !optionalCallback(value.callbackURL, canonicalOrigin) ||
      !optionalBoolean(value.rememberMe)
    )
      invalid();
    return;
  }
  if (path === "/api/auth/sign-in/email") {
    if (
      !onlyKeys(value, ["email", "password"], ["callbackURL", "rememberMe"]) ||
      !safeEmail(value.email) ||
      !safePassword(value.password) ||
      !optionalCallback(value.callbackURL, canonicalOrigin) ||
      !optionalBoolean(value.rememberMe)
    )
      invalid();
    return;
  }
  if (path === "/api/auth/request-password-reset") {
    if (
      !onlyKeys(value, ["email", "redirectTo"], []) ||
      !safeEmail(value.email) ||
      !callbackPath(value.redirectTo, canonicalOrigin)
    )
      invalid();
    return;
  }
  if (path === "/api/auth/send-verification-email") {
    if (
      !onlyKeys(value, ["email", "callbackURL"], []) ||
      !safeEmail(value.email) ||
      !callbackPath(value.callbackURL, canonicalOrigin)
    )
      invalid();
    return;
  }
  if (path === "/api/auth/reset-password") {
    if (
      !onlyKeys(value, ["newPassword", "token"], []) ||
      !safePassword(value.newPassword) ||
      typeof value.token !== "string" ||
      !/^[A-Za-z0-9_-]{24}$/.test(value.token)
    )
      invalid();
    return;
  }
  invalid();
}

async function readBoundedBody(
  request: Request,
  allowEmpty: boolean,
): Promise<Uint8Array> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(lengthHeader)) invalid();
    const declared = Number(lengthHeader);
    if (!Number.isSafeInteger(declared) || declared > MAXIMUM_BODY_BYTES)
      invalid();
    if (!allowEmpty && declared === 0) invalid();
  }
  if (!request.body) {
    if (allowEmpty) return new Uint8Array();
    invalid();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_BODY_BYTES) {
        await cancel(reader);
        invalid();
      }
      chunks.push(new Uint8Array(next.value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!allowEmpty && total === 0) invalid();
  if (lengthHeader !== null && Number(lengthHeader) !== total) invalid();
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseJson(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    invalid();
  }
}

function clonedRequest(
  request: Request,
  body: Uint8Array | undefined,
): Request {
  const headers = new Headers(request.headers);
  for (const name of [
    "forwarded",
    "host",
    "x-forwarded-host",
    "x-forwarded-port",
    "x-forwarded-proto",
    "x-original-host",
    "x-original-url",
    "x-rewrite-url",
  ])
    headers.delete(name);
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    ...(body === undefined
      ? {}
      : { body: new TextDecoder("utf-8", { fatal: true }).decode(body) }),
  });
}

async function secureResponse(
  response: Response,
  canonicalOrigin: string,
  path: string,
): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const name of [...headers.keys()])
    if (name.startsWith("access-control-") || name === "server")
      headers.delete(name);
  const location = headers.get("location");
  if (location !== null) {
    try {
      const target = new URL(location, canonicalOrigin);
      if (target.origin !== canonicalOrigin || target.hash)
        throw new TypeError();
    } catch {
      return safeResponse(503, "unavailable");
    }
  }
  for (const [name, value] of Object.entries(BETTER_AUTH_HTTP_RESPONSE_HEADERS))
    headers.set(name, value);
  if (response.status >= 500) return safeResponse(503, "unavailable");
  if (response.status === 429)
    return projectedResponse(
      response.status,
      { status: "rate-limited" },
      headers,
    );
  if (path === "/api/auth/get-session") {
    if (response.status !== 200)
      return projectedResponse(
        response.status,
        { status: "rejected" },
        headers,
      );
    try {
      const value: unknown = await response.json();
      if (value === null)
        return projectedResponse(200, { status: "anonymous" }, headers);
      if (
        !record(value) ||
        !record(value.user) ||
        typeof value.user.name !== "string" ||
        typeof value.user.email !== "string" ||
        typeof value.user.emailVerified !== "boolean"
      )
        throw new TypeError();
      return projectedResponse(
        200,
        {
          status: "authenticated",
          user: {
            name: value.user.name,
            email: value.user.email,
            emailVerified: value.user.emailVerified,
          },
        },
        headers,
      );
    } catch {
      return safeResponse(503, "unavailable");
    }
  }
  if (response.status >= 400) {
    const state =
      path === "/api/auth/sign-in/email" && response.status === 403
        ? "verification-required"
        : "rejected";
    return projectedResponse(response.status, { status: state }, headers);
  }
  if (response.status >= 300) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const status =
    path === "/api/auth/sign-in/email" ? "authenticated" : "accepted";
  return projectedResponse(response.status, { status }, headers);
}

function projectedResponse(
  status: number,
  value: Readonly<Record<string, unknown>>,
  headers: Headers,
): Response {
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { status, headers });
}

function safeResponse(
  status: number,
  state: "rejected" | "not-found" | "unavailable" | "method-not-allowed",
  extraHeaders: Readonly<Record<string, string>> = {},
  bodyless = false,
): Response {
  return new Response(bodyless ? null : JSON.stringify({ status: state }), {
    status,
    headers: {
      ...BETTER_AUTH_HTTP_RESPONSE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function boundedHeaders(headers: Headers): boolean {
  const entries = [...headers.entries()];
  return (
    entries.length <= MAXIMUM_HEADERS &&
    entries.every(
      ([name, value]) =>
        name.length <= MAXIMUM_HEADER_NAME_LENGTH &&
        value.length <= MAXIMUM_HEADER_VALUE_LENGTH &&
        !/[\0\r\n]/.test(value),
    )
  );
}

function exactOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) configurationInvalid();
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin !== value
    )
      configurationInvalid();
    return url.origin;
  } catch {
    configurationInvalid();
  }
}

function callbackPath(value: unknown, canonicalOrigin: string): boolean {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return false;
  try {
    const url = new URL(value, canonicalOrigin);
    return (
      url.origin === canonicalOrigin &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function optionalCallback(value: unknown, canonicalOrigin: string): boolean {
  return value === undefined || callbackPath(value, canonicalOrigin);
}

function safeEmail(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 254 &&
    value === value.toLowerCase() &&
    !/[\u0000-\u0020\u007f-\uffff]/.test(value) &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(value)
  );
}

function safePassword(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function safeName(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 100 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function verificationToken(value: string | null): boolean {
  if (
    value === null ||
    value.length > 2048 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  )
    return false;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(value.split(".")[1]!, "base64url").toString("utf8"),
    );
    return (
      record(payload) &&
      typeof payload.email === "string" &&
      !("updateTo" in payload) &&
      !("requestType" in payload)
    );
  } catch {
    return false;
  }
}

function exactQuery(
  actual: readonly (readonly [string, string])[],
  names: readonly string[],
): boolean {
  return (
    actual.length === names.length &&
    actual.every(([name], index) => name === names[index])
  );
}

function onlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function cancel(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Rejection is independent of stream cancellation.
  }
}

function invalid(): never {
  throw new TypeError("Invalid authentication HTTP request");
}

function configurationInvalid(): never {
  throw new TypeError("Authentication HTTP configuration is unavailable");
}
