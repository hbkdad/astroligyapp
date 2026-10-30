import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const validator = resolve(process.cwd(), "scripts/validate-runtime-config.mjs");
const validEnvironment = Object.freeze({
  NEXT_DEPLOYMENT_ID: "release-abcdef1",
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  NEXT_SHARED_CACHE_ENABLED: "true",
  NEXT_SHARED_CACHE_URL: "redis://valkey:6379",
  NEXT_SHARED_CACHE_ALLOW_INSECURE_LOCAL: "true",
  APP_TASK_MAX_COUNT: "2",
  DATABASE_MAX_CONNECTIONS: "100",
  DATABASE_RESERVED_CONNECTIONS: "20",
  DATABASE_ALLOW_INSECURE_LOCAL: "true",
  DATABASE_URL: "postgresql://app_runtime_executor:local@127.0.0.1:5432/cosmic",
  BETTER_AUTH_DATABASE_URL:
    "postgresql://auth_http_executor:local@127.0.0.1:5432/cosmic",
  AUTH_ACCOUNT_DATABASE_URL:
    "postgresql://auth_account_executor:local@127.0.0.1:5432/cosmic",
  AUTH_EMAIL_DATABASE_URL:
    "postgresql://auth_email_executor:local@127.0.0.1:5432/cosmic",
  AUTH_EMAIL_FEEDBACK_DATABASE_URL:
    "postgresql://auth_feedback_executor:local@127.0.0.1:5432/cosmic",
});

describe("production runtime configuration", () => {
  it("accepts a bounded local two-task topology without printing secrets", () => {
    const result = validate(validEnvironment);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("runtime configuration valid");
    expect(result.stdout).not.toContain(
      validEnvironment.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    );
  });

  it.each([
    ["missing deployment identity", { NEXT_DEPLOYMENT_ID: "" }],
    [
      "invalid encryption key",
      { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "not-base64" },
    ],
    ["disabled shared cache", { NEXT_SHARED_CACHE_ENABLED: "false" }],
    [
      "non-TLS remote cache",
      { NEXT_SHARED_CACHE_URL: "redis://cache.example:6379" },
    ],
    ["unbounded task count", { APP_TASK_MAX_COUNT: "21" }],
    ["exceeded database budget", { APP_TASK_MAX_COUNT: "3" }],
    [
      "wrong database login",
      {
        DATABASE_URL: "postgresql://wrong_executor:local@127.0.0.1:5432/cosmic",
      },
    ],
    [
      "non-verifying remote database TLS",
      {
        DATABASE_URL:
          "postgresql://app_runtime_executor:local@database.example:5432/cosmic?sslmode=require",
      },
    ],
    [
      "insecure public IP database",
      {
        DATABASE_URL:
          "postgresql://app_runtime_executor:local@203.0.113.8:5432/cosmic",
      },
    ],
    [
      "duplicate database TLS mode",
      {
        DATABASE_ALLOW_INSECURE_LOCAL: "false",
        DATABASE_URL:
          "postgresql://app_runtime_executor:local@database.example:5432/cosmic?sslmode=verify-full&sslmode=verify-full",
      },
    ],
    [
      "database login query override",
      {
        DATABASE_ALLOW_INSECURE_LOCAL: "false",
        DATABASE_URL:
          "postgresql://app_runtime_executor:local@database.example:5432/cosmic?sslmode=verify-full&user=wrong_executor",
      },
    ],
    [
      "database startup role option",
      {
        DATABASE_ALLOW_INSECURE_LOCAL: "false",
        DATABASE_URL:
          "postgresql://app_runtime_executor:local@database.example:5432/cosmic?sslmode=verify-full&options=-c%20role%3Dapp_user",
      },
    ],
  ])("rejects %s", (_label, overrides) => {
    const result = validate({ ...validEnvironment, ...overrides });

    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain(
      validEnvironment.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    );
    expect(result.stderr).not.toContain(validEnvironment.NEXT_SHARED_CACHE_URL);
  });
});

function validate(environment: Record<string, string>) {
  return spawnSync(process.execPath, [validator], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}
