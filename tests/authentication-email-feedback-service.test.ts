import { describe, expect, it, vi } from "vitest";

import {
  createAuthenticationEmailFeedbackServicePool,
  loadAuthenticationEmailFeedbackServiceConfiguration,
  runAuthenticationEmailFeedbackService,
  serializeAuthenticationEmailFeedbackCycle,
} from "@/server/authentication-email-feedback-service";

const SECURE_DATABASE =
  "postgresql://feedback:private@database.example:5432/cosmic?sslmode=verify-full";

function configuration() {
  return loadAuthenticationEmailFeedbackServiceConfiguration({
    AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
  });
}

function cycle() {
  return {
    version: "1.0.0" as const,
    disposition: "completed" as const,
    received: 3,
    acknowledged: 1,
    retried: 1,
    reconciled: 1,
    invalid: 0,
    deleteFailures: 0,
    visibilityFailures: 0,
    oldestMessageAgeSeconds: 60,
  };
}

describe("authentication email feedback service", () => {
  it("loads only a verified-TLS database URL and fixes the pool budget at four", async () => {
    const loaded = configuration();
    expect(loaded).toEqual({
      version: "1.0.0",
      databaseUrl: SECURE_DATABASE,
      maximumDatabaseConnections: 4,
    });
    const pool = createAuthenticationEmailFeedbackServicePool(loaded);
    expect(pool.options.max).toBe(4);
    await pool.end();
  });

  it("permits plaintext PostgreSQL only for an explicit local container topology", () => {
    expect(
      loadAuthenticationEmailFeedbackServiceConfiguration({
        AUTH_EMAIL_FEEDBACK_DATABASE_URL:
          "postgresql://feedback:private@postgres:5432/cosmic",
        AUTH_EMAIL_FEEDBACK_DATABASE_ALLOW_INSECURE_LOCAL: "true",
      }),
    ).toMatchObject({ maximumDatabaseConnections: 4 });
    expect(() =>
      loadAuthenticationEmailFeedbackServiceConfiguration({
        AUTH_EMAIL_FEEDBACK_DATABASE_URL:
          "postgresql://feedback:private@database.example:5432/cosmic",
        AUTH_EMAIL_FEEDBACK_DATABASE_ALLOW_INSECURE_LOCAL: "true",
      }),
    ).toThrow("Invalid authentication email feedback service input");
  });

  it("requires only the ECS relative task-credential path in production", () => {
    expect(
      loadAuthenticationEmailFeedbackServiceConfiguration({
        NODE_ENV: "production",
        AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
        AWS_EC2_METADATA_DISABLED: "true",
        AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:
          "/v2/credentials/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }),
    ).toMatchObject({ maximumDatabaseConnections: 4 });
    for (const environment of [
      {
        NODE_ENV: "production",
        AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
      },
      {
        NODE_ENV: "production",
        AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
        AWS_EC2_METADATA_DISABLED: "false",
        AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:
          "/v2/credentials/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      },
      {
        NODE_ENV: "production",
        AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
        AWS_EC2_METADATA_DISABLED: "true",
        AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "http://attacker.example",
      },
    ]) {
      expect(() =>
        loadAuthenticationEmailFeedbackServiceConfiguration(environment),
      ).toThrow("Invalid authentication email feedback service input");
    }
  });

  it.each([
    {},
    { AUTH_EMAIL_FEEDBACK_DATABASE_URL: "private" },
    {
      AUTH_EMAIL_FEEDBACK_DATABASE_URL:
        "postgresql://feedback:private@database.example:5432/cosmic?sslmode=require",
    },
    {
      AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
      NEXT_PUBLIC_AUTH_EMAIL_FEEDBACK_KEYS: "private",
    },
    {
      AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
      AWS_ENDPOINT_URL_SQS: "https://attacker.example",
    },
    {
      AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
      AWS_ACCESS_KEY_ID: "static-key",
    },
    {
      AUTH_EMAIL_FEEDBACK_DATABASE_URL: SECURE_DATABASE,
      AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://attacker.example",
    },
  ])(
    "rejects unsafe database, public, endpoint, and credential configuration",
    (value) => {
      expect(() =>
        loadAuthenticationEmailFeedbackServiceConfiguration(value),
      ).toThrow("Invalid authentication email feedback service input");
    },
  );

  it("reports only fixed aggregate fields and closes the pool after graceful stop", async () => {
    const report = vi.fn();
    const end = vi.fn(async () => undefined);
    const controller = new AbortController();
    const worker = {
      async run(
        signal: AbortSignal,
        callback: (value: ReturnType<typeof cycle>) => void,
      ) {
        callback(cycle());
        controller.abort();
        expect(signal.aborted).toBe(true);
      },
    };
    await runAuthenticationEmailFeedbackService({
      worker,
      pool: { end },
      signal: controller.signal,
      report,
      configuration: configuration(),
    });
    expect(end).toHaveBeenCalledOnce();
    const output = report.mock.calls[0]![0] as string;
    expect(JSON.parse(output)).toEqual({
      version: "1.0.0",
      event: "authentication-email-feedback-worker-cycle",
      disposition: "completed",
      received: 3,
      acknowledged: 1,
      retried: 1,
      reconciled: 1,
      invalid: 0,
      deleteFailures: 0,
      visibilityFailures: 0,
      oldestMessageAgeSeconds: 60,
    });
    expect(output).not.toMatch(/recipient|receipt|signature|private@/i);
  });

  it("closes the database pool when the worker fails", async () => {
    const end = vi.fn(async () => undefined);
    await expect(
      runAuthenticationEmailFeedbackService({
        worker: {
          async run() {
            throw new Error("private database or queue detail");
          },
        },
        pool: { end },
        signal: new AbortController().signal,
        report: vi.fn(),
        configuration: configuration(),
      }),
    ).rejects.toThrow("private database or queue detail");
    expect(end).toHaveBeenCalledOnce();
  });

  it("serializes no extra fields supplied through an object-shaped cycle", () => {
    expect(
      serializeAuthenticationEmailFeedbackCycle({
        ...cycle(),
        recipient: "person@example.test",
        receiptHandle: "private-receipt",
      } as never),
    ).not.toMatch(/person|receiptHandle/);
  });
});
