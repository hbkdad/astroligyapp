import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BETTER_AUTH_HTTP_RESPONSE_HEADERS,
  createBetterAuthHttpHandler,
  createLazyBetterAuthHttpHandler,
} from "@/server/better-auth-http";

const ORIGIN = "https://app.example.test";
const PASSWORD = "current-password-123";
const RESET_TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";
const VERIFY_TOKEN = `header.${Buffer.from(
  JSON.stringify({ email: "fixture@example.test", iat: 1, exp: 2 }),
).toString("base64url")}.signature`;

function jsonRequest(
  path: string,
  value: unknown,
  overrides: Readonly<Record<string, string>> = {},
): Request {
  const body = JSON.stringify(value);
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      ...overrides,
    },
    body,
  });
}

function getRequest(path: string, site = "same-origin"): Request {
  return new Request(`${ORIGIN}${path}`, {
    headers: { "sec-fetch-site": site },
  });
}

function fixture(
  response: Response = Response.json(
    { status: true },
    {
      headers: {
        "set-cookie":
          "cosmic-auth.session_token=opaque; Path=/; HttpOnly; Secure; SameSite=Lax",
        server: "private-runtime",
        "access-control-allow-origin": "*",
      },
    },
  ),
) {
  const handle = vi.fn(async (request: Request) => {
    void request;
    return response;
  });
  const getService = vi.fn(() => ({ handle }));
  return {
    handler: createBetterAuthHttpHandler(ORIGIN, getService),
    getService,
    handle,
  };
}

const allowedPosts = [
  [
    "/api/auth/sign-up/email",
    {
      name: "Local Fixture",
      email: "fixture@example.test",
      password: PASSWORD,
      callbackURL: "/account",
    },
  ],
  [
    "/api/auth/sign-in/email",
    {
      email: "fixture@example.test",
      password: PASSWORD,
      rememberMe: false,
    },
  ],
  [
    "/api/auth/request-password-reset",
    { email: "fixture@example.test", redirectTo: "/account/reset-password" },
  ],
  [
    "/api/auth/send-verification-email",
    { email: "fixture@example.test", callbackURL: "/account" },
  ],
  [
    "/api/auth/reset-password",
    { newPassword: "replacement-password-456", token: RESET_TOKEN },
  ],
] as const;

describe("Better Auth public HTTP boundary", () => {
  it.each(allowedPosts)(
    "forwards only the selected POST contract %s",
    async (path, body) => {
      const value = fixture();
      const response = await value.handler(
        jsonRequest(path, body, {
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "http",
          "x-original-url": "/api/auth/delete-user",
        }),
      );
      expect(response.status).toBe(200);
      expect(value.handle).toHaveBeenCalledOnce();
      const forwarded = value.handle.mock.calls[0]![0];
      expect(forwarded.headers.get("x-forwarded-host")).toBeNull();
      expect(forwarded.headers.get("x-forwarded-proto")).toBeNull();
      expect(forwarded.headers.get("x-original-url")).toBeNull();
      expect(await forwarded.clone().json()).toEqual(body);
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(response.headers.get("server")).toBeNull();
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      for (const [name, header] of Object.entries(
        BETTER_AUTH_HTTP_RESPONSE_HEADERS,
      ))
        expect(response.headers.get(name)).toBe(header);
    },
  );

  it("allows empty same-origin sign-out and no public current-password endpoint", async () => {
    const value = fixture();
    const signOut = new Request(`${ORIGIN}/api/auth/sign-out`, {
      method: "POST",
      headers: { origin: ORIGIN, "sec-fetch-site": "same-origin" },
    });
    await expect(value.handler(signOut)).resolves.toMatchObject({
      status: 200,
    });
    expect(value.handle).toHaveBeenCalledOnce();

    const currentPassword = jsonRequest("/api/auth/verify-password", {
      password: PASSWORD,
    });
    await expect(value.handler(currentPassword)).resolves.toMatchObject({
      status: 404,
    });
    expect(value.handle).toHaveBeenCalledOnce();
  });

  it.each(["HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"])(
    "returns an explicit method policy for %s",
    async (method) => {
      const value = fixture();
      const response = await value.handler(
        new Request(`${ORIGIN}/api/auth/get-session`, {
          method,
          headers: { "sec-fetch-site": "same-origin" },
        }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(value.getService).not.toHaveBeenCalled();
      if (method === "HEAD") expect(await response.text()).toBe("");
    },
  );

  it.each([
    `/api/auth/get-session`,
    `/api/auth/verify-email?token=${VERIFY_TOKEN}&callbackURL=%2Faccount`,
    `/api/auth/reset-password/${RESET_TOKEN}?callbackURL=%2Faccount%2Freset-password`,
  ])("forwards the selected GET contract %s", async (path) => {
    const value = fixture(
      path.includes("get-session")
        ? Response.json({
            session: {
              id: "private-session-id",
              token: "private-session-token",
              ipAddress: "192.0.2.44",
            },
            user: {
              id: "private-user-id",
              name: "Local Fixture",
              email: "fixture@example.test",
              emailVerified: true,
            },
          })
        : new Response(null, {
            status: 302,
            headers: { location: `${ORIGIN}/account` },
          }),
    );
    const site = path.includes("get-session") ? "same-origin" : "cross-site";
    const response = await value.handler(getRequest(path, site));
    expect(response.status).toBe(path.includes("get-session") ? 200 : 302);
    expect(value.handle).toHaveBeenCalledOnce();
    if (path.includes("get-session")) {
      const text = await response.text();
      expect(text).toContain("fixture@example.test");
      expect(text).not.toMatch(/private-session|private-user|192\.0\.2\.44/);
    }
  });

  it.each([
    "/api/auth/sign-in/social",
    "/api/auth/callback/google",
    "/api/auth/list-accounts",
    "/api/auth/link-social",
    "/api/auth/unlink-account",
    "/api/auth/get-access-token",
    "/api/auth/refresh-token",
    "/api/auth/update-user",
    "/api/auth/change-email",
    "/api/auth/change-password",
    "/api/auth/delete-user",
    "/api/auth/list-sessions",
    "/api/auth/revoke-session",
    "/api/auth/ok",
    "/api/auth/error",
  ])("does not expose unselected package endpoint %s", async (path) => {
    const value = fixture();
    const response = await value.handler(jsonRequest(path, {}));
    expect(response.status).toBe(404);
    expect(value.getService).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ status: "not-found" });
  });

  it.each([
    jsonRequest(
      "/api/auth/sign-in/email",
      {
        email: "fixture@example.test",
        password: PASSWORD,
      },
      { origin: "https://evil.example" },
    ),
    jsonRequest(
      "/api/auth/sign-in/email",
      {
        email: "fixture@example.test",
        password: PASSWORD,
      },
      { "sec-fetch-site": "cross-site" },
    ),
    jsonRequest(
      "/api/auth/sign-in/email",
      {
        email: "fixture@example.test",
        password: PASSWORD,
      },
      { authorization: "Bearer attacker" },
    ),
    jsonRequest(
      "/api/auth/sign-in/email",
      {
        email: "fixture@example.test",
        password: PASSWORD,
      },
      { "x-http-method-override": "DELETE" },
    ),
    jsonRequest("/api/auth/sign-in/email", {
      email: "Fixture@Example.test",
      password: PASSWORD,
    }),
    jsonRequest("/api/auth/sign-up/email", {
      name: "Fixture",
      email: "fixture@example.test",
      password: PASSWORD,
      image: "https://evil.example/avatar",
    }),
    jsonRequest("/api/auth/request-password-reset", {
      email: "fixture@example.test",
      redirectTo: "https://evil.example/reset",
    }),
    jsonRequest("/api/auth/reset-password", {
      newPassword: "replacement-password-456",
      token: RESET_TOKEN,
      subject: "attacker-subject",
    }),
    getRequest(
      `/api/auth/verify-email?token=${VERIFY_TOKEN}&callbackURL=https%3A%2F%2Fevil.example`,
      "cross-site",
    ),
    getRequest(
      `/api/auth/verify-email?token=header.${Buffer.from(
        JSON.stringify({
          email: "fixture@example.test",
          updateTo: "attacker@example.test",
          requestType: "change-email-verification",
        }),
      ).toString("base64url")}.signature&callbackURL=%2Faccount`,
      "cross-site",
    ),
    getRequest(`/api/auth/get-session?account=attacker`),
  ])(
    "rejects hostile origin, identity, redirect, or shape before service",
    async (request) => {
      const value = fixture();
      const response = await value.handler(request);
      expect(response.status).toBe(400);
      expect(value.getService).not.toHaveBeenCalled();
      expect(JSON.stringify(await response.json())).not.toMatch(
        /evil|fixture|password|subject|account/,
      );
    },
  );

  it("rejects malformed, mismatched, and oversized bodies before service", async () => {
    const value = fixture();
    const malformed = new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        "content-length": "1",
      },
      body: "{}",
    });
    const oversized = jsonRequest("/api/auth/sign-in/email", {
      email: "fixture@example.test",
      password: "x".repeat(5_000),
    });
    await expect(value.handler(malformed)).resolves.toMatchObject({
      status: 400,
    });
    await expect(value.handler(oversized)).resolves.toMatchObject({
      status: 400,
    });
    expect(value.getService).not.toHaveBeenCalled();
  });

  it("rejects excessive header cardinality before service", async () => {
    const value = fixture();
    const headers = new Headers({
      "sec-fetch-site": "same-origin",
    });
    for (let index = 0; index < 65; index += 1)
      headers.set(`x-padding-${index}`, "bounded");
    const response = await value.handler(
      new Request(`${ORIGIN}/api/auth/get-session`, { headers }),
    );
    expect(response.status).toBe(400);
    expect(value.getService).not.toHaveBeenCalled();
  });

  it("collapses service failure and unsafe redirects without leaking details", async () => {
    const failed = fixture();
    failed.handle.mockRejectedValueOnce(new Error("database-secret"));
    const failure = await failed.handler(getRequest("/api/auth/get-session"));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ status: "unavailable" });

    const redirected = fixture(
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/token=private" },
      }),
    );
    const response = await redirected.handler(
      getRequest(
        `/api/auth/verify-email?token=${VERIFY_TOKEN}&callbackURL=%2Faccount`,
        "cross-site",
      ),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    undefined,
    "http://app.example.test",
    "https://user@app.example.test",
  ])("rejects unsafe canonical configuration %s", (origin) => {
    expect(() =>
      createBetterAuthHttpHandler(origin, () => ({
        handle: async () => Response.json({}),
      })),
    ).toThrow("Authentication HTTP configuration is unavailable");
  });

  it("loads canonical configuration once but constructs service only for valid traffic", async () => {
    const loadOrigin = vi.fn(() => ORIGIN);
    const handle = vi.fn(async () => Response.json(null));
    const getService = vi.fn(() => ({ handle }));
    const lazy = createLazyBetterAuthHttpHandler(loadOrigin, getService);

    await expect(
      lazy(jsonRequest("/api/auth/delete-user", {})),
    ).resolves.toMatchObject({ status: 404 });
    expect(loadOrigin).toHaveBeenCalledOnce();
    expect(getService).not.toHaveBeenCalled();

    await expect(
      lazy(getRequest("/api/auth/get-session")),
    ).resolves.toMatchObject({ status: 200 });
    expect(loadOrigin).toHaveBeenCalledOnce();
    expect(getService).toHaveBeenCalledOnce();
  });
});
