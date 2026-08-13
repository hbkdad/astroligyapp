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
