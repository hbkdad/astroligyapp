import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BetterAuthHttpServiceConfigurationError,
  createBetterAuthHttpService,
  loadBetterAuthHttpServiceConfiguration,
} from "@/server/better-auth-http-service";

const ORIGIN = "https://app.example.test";
const AUTH_SECRET = "local-auth-secret-value-that-is-long-enough-0001";
const IDEMPOTENCY_KEY = createHash("sha256")
  .update("idempotency")
  .digest("base64url");
const FEEDBACK_KEY = createHash("sha256")
  .update("feedback")
  .digest("base64url");

function environment(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "production",
    BETTER_AUTH_BASE_URL: ORIGIN,
    BETTER_AUTH_TRUSTED_ORIGINS: ORIGIN,
    BETTER_AUTH_SECRETS: `1:${AUTH_SECRET}`,
    BETTER_AUTH_IP_HEADER: "x-forwarded-for",
    BETTER_AUTH_TRUSTED_PROXIES: "192.0.2.10",
    BETTER_AUTH_DATABASE_URL: "postgresql://auth:local@127.0.0.1:5432/cosmic",
    AUTH_EMAIL_DATABASE_URL: "postgresql://email:local@127.0.0.1:5432/cosmic",
    AUTH_EMAIL_FEEDBACK_DATABASE_URL:
      "postgresql://feedback:local@127.0.0.1:5432/cosmic",
    AUTH_EMAIL_IDEMPOTENCY_KEYS: `1:${IDEMPOTENCY_KEY}`,
    AUTH_EMAIL_IDEMPOTENCY_LEASE_SECONDS: "120",
    AUTH_EMAIL_FEEDBACK_KEYS: `1:${FEEDBACK_KEY}`,
    SES_AUTH_EMAIL_REGION: "ca-central-1",
    SES_AUTH_EMAIL_FROM: "security@auth.example.test",
    SES_AUTH_EMAIL_CONFIGURATION_SET: "authentication-events",
    SES_AUTH_EMAIL_FEEDBACK_TOPIC_ARN:
      "arn:aws:sns:ca-central-1:123456789012:authentication-feedback",
    SES_AUTH_EMAIL_IDENTITY_ARN:
      "arn:aws:ses:ca-central-1:123456789012:identity/auth.example.test",
    ...overrides,
  };
}

describe("Better Auth HTTP process service", () => {
  it("loads exact server-only database, auth, idempotency, feedback, and SES configuration", () => {
    const configuration = loadBetterAuthHttpServiceConfiguration(environment());
    expect(configuration).toMatchObject({
      auth: { baseUrl: ORIGIN, production: true },
      authDatabaseUrl: "postgresql://auth:local@127.0.0.1:5432/cosmic",
      emailDatabaseUrl: "postgresql://email:local@127.0.0.1:5432/cosmic",
      feedbackDatabaseUrl: "postgresql://feedback:local@127.0.0.1:5432/cosmic",
      idempotency: { leaseMilliseconds: 120_000 },
      feedback: {
        topicArn:
          "arn:aws:sns:ca-central-1:123456789012:authentication-feedback",
      },
      ses: { region: "ca-central-1", canonicalOrigin: ORIGIN },
    });
  });

  it.each([
    {},
    environment({ BETTER_AUTH_DATABASE_URL: undefined }),
    environment({ AUTH_EMAIL_DATABASE_URL: "https://database.example" }),
    environment({ AUTH_EMAIL_FEEDBACK_DATABASE_URL: "postgresql://localhost" }),
    environment({
      NEXT_PUBLIC_BETTER_AUTH_DATABASE_URL:
        "postgresql://public:leak@localhost/cosmic",
    }),
    environment({
      NEXT_PUBLIC_AUTH_EMAIL_DATABASE_URL:
        "postgresql://public:leak@localhost/cosmic",
    }),
    environment({
      NEXT_PUBLIC_AUTH_EMAIL_FEEDBACK_DATABASE_URL:
        "postgresql://public:leak@localhost/cosmic",
    }),
  ])(
    "rejects incomplete, unsafe, or browser-exposed process configuration",
    (value) => {
      expect(() => loadBetterAuthHttpServiceConfiguration(value)).toThrow(
        BetterAuthHttpServiceConfigurationError,
      );
    },
  );

  it("constructs no network call and closes every process dependency once", async () => {
    const configuration = loadBetterAuthHttpServiceConfiguration(environment());
    const destroy = vi.fn();
    const send = vi.fn();
    const service = createBetterAuthHttpService(
      configuration,
      () => ({ destroy, send }) as never,
    );
    expect(service.canonicalOrigin).toBe(ORIGIN);
    expect(send).not.toHaveBeenCalled();
    await service.close();
    await service.close();
    expect(destroy).toHaveBeenCalledOnce();
    await expect(
      service.handle(new Request(`${ORIGIN}/api/auth/get-session`)),
    ).rejects.toThrow("Authentication HTTP service is unavailable");
  });
});
