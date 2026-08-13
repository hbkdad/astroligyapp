export const AUTH_SESSION_CHANGED_EVENT = "cosmic-auth-session-changed";

export type PublicAuthUser = Readonly<{
  name: string;
  email: string;
  emailVerified: boolean;
}>;

export type AuthSessionResult =
  | Readonly<{ status: "anonymous" }>
  | Readonly<{ status: "authenticated"; user: PublicAuthUser }>
  | Readonly<{ status: "rejected" | "rate-limited" | "unavailable" }>;

export type AuthMutationResult = Readonly<{
  status:
    | "accepted"
    | "authenticated"
    | "rejected"
    | "verification-required"
    | "rate-limited"
    | "unavailable";
}>;

export type AuthMutationPath =
  | "/api/auth/sign-up/email"
  | "/api/auth/sign-in/email"
  | "/api/auth/request-password-reset"
  | "/api/auth/send-verification-email"
  | "/api/auth/reset-password";

export async function getAuthSession(
  fetcher: typeof fetch = fetch,
): Promise<AuthSessionResult> {
  try {
    const response = await fetcher("/api/auth/get-session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    return await parseSessionResponse(response);
  } catch {
    return Object.freeze({ status: "unavailable" });
  }
}

export async function postAuthMutation(
  path: AuthMutationPath,
  body: Readonly<Record<string, unknown>>,
  fetcher: typeof fetch = fetch,
): Promise<AuthMutationResult> {
  try {
    const response = await fetcher(path, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return await parseMutationResponse(response);
  } catch {
    return Object.freeze({ status: "unavailable" });
  }
}

export async function signOut(
  fetcher: typeof fetch = fetch,
): Promise<AuthMutationResult> {
  try {
    const response = await fetcher("/api/auth/sign-out", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    return await parseMutationResponse(response);
  } catch {
    return Object.freeze({ status: "unavailable" });
  }
}

export async function parseSessionResponse(
  response: Response,
): Promise<AuthSessionResult> {
  const value = await projectedJson(response);
  if (!record(value) || typeof value.status !== "string") return unavailable();
  if (
    value.status === "anonymous" &&
    response.status === 200 &&
    exactKeys(value, ["status"])
  )
    return Object.freeze({ status: "anonymous" });
  if (
    value.status === "authenticated" &&
    response.status === 200 &&
    exactKeys(value, ["status", "user"]) &&
    publicUser(value.user)
  ) {
    return Object.freeze({
      status: "authenticated",
      user: Object.freeze({
        name: value.user.name,
        email: value.user.email,
        emailVerified: value.user.emailVerified,
      }),
    });
  }
  if (
    value.status === "rate-limited" &&
    response.status === 429 &&
    exactKeys(value, ["status"])
  )
    return Object.freeze({ status: "rate-limited" });
  if (
    value.status === "rejected" &&
    response.status >= 400 &&
    response.status < 500 &&
    exactKeys(value, ["status"])
  )
    return Object.freeze({ status: "rejected" });
  return unavailable();
}

export async function parseMutationResponse(
  response: Response,
): Promise<AuthMutationResult> {
  const value = await projectedJson(response);
  if (!record(value) || !exactKeys(value, ["status"])) return unavailable();
  const { status } = value;
  if (
    (status === "accepted" || status === "authenticated") &&
    response.status >= 200 &&
    response.status < 300
  )
    return Object.freeze({ status });
  if (status === "verification-required" && response.status === 403)
    return Object.freeze({ status });
  if (status === "rate-limited" && response.status === 429)
    return Object.freeze({ status });
  if (
    status === "rejected" &&
    response.status >= 400 &&
    response.status < 500 &&
    response.status !== 429
  )
    return Object.freeze({ status });
  if (status === "unavailable" && response.status === 503)
    return Object.freeze({ status });
  return unavailable();
}

async function projectedJson(response: Response): Promise<unknown> {
  if (!(response instanceof Response)) return null;
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (!contentType?.startsWith("application/json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function publicUser(value: unknown): value is PublicAuthUser {
  return (
    record(value) &&
    exactKeys(value, ["name", "email", "emailVerified"]) &&
    typeof value.name === "string" &&
    value.name.length >= 1 &&
    value.name.length <= 100 &&
    typeof value.email === "string" &&
    value.email.length >= 3 &&
    value.email.length <= 254 &&
    typeof value.emailVerified === "boolean"
  );
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unavailable(): Readonly<{ status: "unavailable" }> {
  return Object.freeze({ status: "unavailable" });
}
