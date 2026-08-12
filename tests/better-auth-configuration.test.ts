import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BetterAuthConfigurationError,
  createBetterAuthOptions,
  loadBetterAuthConfiguration,
  type AuthEmailDispatcher,
  type BetterAuthConfiguration,
} from "@/server/better-auth-configuration";

const SECRET = "local-test-secret-value-that-is-long-enough-0001";

function configuration(
  overrides: Partial<BetterAuthConfiguration> = {},
): BetterAuthConfiguration {
  return {
    baseUrl: "https://app.example.test",
    trustedOrigins: ["https://app.example.test"],
    secrets: [{ version: 2, value: SECRET }],
    production: true,
    proxy: {
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: ["192.0.2.10"],
    },
    ...overrides,
  };
}

function dispatcher(): AuthEmailDispatcher & {
  sendVerification: ReturnType<typeof vi.fn>;
  sendPasswordReset: ReturnType<typeof vi.fn>;
} {
  return {
    sendVerification: vi.fn(async () => undefined),
    sendPasswordReset: vi.fn(async () => undefined),
  };
}

const productionWithoutProxy: BetterAuthConfiguration = {
  baseUrl: "https://app.example.test",
  trustedOrigins: ["https://app.example.test"],
  secrets: [{ version: 2, value: SECRET }],
  production: true,
};

describe("Better Auth server configuration", () => {
  it("loads only explicit server-side origins, rollover keys, and proxy trust", () => {
    expect(
      loadBetterAuthConfiguration({
        NODE_ENV: "production",
        BETTER_AUTH_BASE_URL: "https://app.example.test",
        BETTER_AUTH_TRUSTED_ORIGINS:
          "https://app.example.test,https://admin.example.test",
        BETTER_AUTH_SECRETS: `2:${SECRET},1:${SECRET}-previous`,
        BETTER_AUTH_IP_HEADER: "x-forwarded-for",
        BETTER_AUTH_TRUSTED_PROXIES: "192.0.2.10,2001:db8::1",
      }),
    ).toEqual({
      baseUrl: "https://app.example.test",
      trustedOrigins: [
        "https://app.example.test",
        "https://admin.example.test",
      ],
      secrets: [
        { version: 2, value: SECRET },
        { version: 1, value: `${SECRET}-previous` },
      ],
      production: true,
      proxy: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: ["192.0.2.10", "2001:db8::1"],
      },
    });
  });

  it.each([
    {},
    {
      NODE_ENV: "production",
      BETTER_AUTH_BASE_URL: "https://app.example.test",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://app.example.test",
      BETTER_AUTH_SECRETS: `1:${SECRET}`,
    },
    {
      NODE_ENV: "test",
      BETTER_AUTH_BASE_URL: "http://127.0.0.1:3000",
      BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:3000",
      BETTER_AUTH_SECRETS: `1:${SECRET}`,
      NEXT_PUBLIC_BETTER_AUTH_SECRET: SECRET,
    },
  ])(
    "rejects missing or browser-exposed environment configuration",
    (value) => {
      expect(() => loadBetterAuthConfiguration(value)).toThrow(
        BetterAuthConfigurationError,
      );
    },
  );

  it("pins the reviewed database-session, cookie, verification, and rate profile", () => {
    const options = createBetterAuthOptions(
      {} as never,
      dispatcher(),
      configuration(),
    );

    expect(options.baseURL).toBe("https://app.example.test");
    expect(options.trustedOrigins).toEqual(["https://app.example.test"]);
    expect(options.secrets).toEqual([{ version: 2, value: SECRET }]);
    expect(options.secondaryStorage).toBeUndefined();
    expect(options.plugins).toEqual([]);
    expect(options.socialProviders).toEqual({});
    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    });
    expect(options.emailVerification).toMatchObject({
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
    });
    expect(options.user).toEqual({
      changeEmail: {
        enabled: false,
        updateEmailWithoutVerification: false,
      },
      deleteUser: { enabled: false },
    });
    expect(options.session).toMatchObject({
      expiresIn: 604_800,
      updateAge: 86_400,
      freshAge: 600,
      cookieCache: { enabled: false, refreshCache: false },
    });
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      storage: "memory",
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 600, max: 5 },
        "/request-password-reset": { window: 600, max: 5 },
        "/send-verification-email": { window: 600, max: 5 },
      },
    });
    expect(options.advanced).toMatchObject({
      useSecureCookies: true,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      },
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: ["192.0.2.10"],
      },
    });
    expect(options.telemetry).toEqual({ enabled: false, debug: false });
  });

  it("injects email delivery without exposing raw verification tokens", async () => {
    const delivery = dispatcher();
    const options = createBetterAuthOptions(
      {} as never,
      delivery,
      configuration(),
    );
    const user = {
      id: "user-1",
      name: "Fixture",
      email: "fixture@example.test",
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await options.emailVerification!.sendVerificationEmail!({
      user,
      url: "https://app.example.test/verify?token=opaque",
      token: "must-not-cross-dispatch-port",
    });
    await options.emailAndPassword!.sendResetPassword!({
      user,
      url: "https://app.example.test/reset?token=opaque",
      token: "must-not-cross-dispatch-port",
    });

    expect(delivery.sendVerification).toHaveBeenCalledWith({
      to: "fixture@example.test",
      url: "https://app.example.test/verify?token=opaque",
    });
    expect(delivery.sendPasswordReset).toHaveBeenCalledWith({
      to: "fixture@example.test",
      url: "https://app.example.test/reset?token=opaque",
    });
    expect(delivery.sendVerification.mock.calls[0]?.[0]).not.toHaveProperty(
      "token",
    );
  });

  it.each([
    configuration({ baseUrl: "http://app.example.test" }),
    configuration({ baseUrl: "https://user@app.example.test" }),
    configuration({ baseUrl: "https://app.example.test/path" }),
    configuration({ trustedOrigins: ["https://other.example.test"] }),
    configuration({ trustedOrigins: ["https://*.example.test"] }),
    configuration({ secrets: [] }),
    configuration({ secrets: [{ version: 2, value: "short" }] }),
    configuration({
      secrets: [
        { version: 1, value: SECRET },
        { version: 2, value: `${SECRET}-old` },
      ],
    }),
    productionWithoutProxy,
    configuration({
      proxy: {
        ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
        trustedProxies: ["192.0.2.10"],
      },
    }),
  ])("rejects unsafe configuration without reflecting it", (value) => {
    expect(() =>
      createBetterAuthOptions({} as never, dispatcher(), value),
    ).toThrow(BetterAuthConfigurationError);
    try {
      createBetterAuthOptions({} as never, dispatcher(), value);
    } catch (error) {
      expect(String(error)).toBe(
        "BetterAuthConfigurationError: Authentication configuration is unavailable",
      );
      expect(String(error)).not.toContain(SECRET);
    }
  });

  it("permits explicit loopback HTTP only outside production", () => {
    const options = createBetterAuthOptions({} as never, dispatcher(), {
      baseUrl: "http://127.0.0.1:3000",
      trustedOrigins: ["http://127.0.0.1:3000"],
      secrets: [{ version: 1, value: SECRET }],
      production: false,
    });

    expect(options.advanced).toMatchObject({
      useSecureCookies: false,
      defaultCookieAttributes: { secure: false },
    });
  });
});
