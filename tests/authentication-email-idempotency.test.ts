import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AuthenticationEmailIdempotencyRepository,
  createAuthenticationEmailIdempotencyReferenceFactory,
  loadAuthenticationEmailIdempotencyConfiguration,
} from "@/server/authentication-email-idempotency";
import { AuthenticationEmailConfigurationError } from "@/server/authentication-email";

const KEY_2 = createHash("sha256").update("test-key-2").digest("base64url");
const KEY_1 = createHash("sha256").update("test-key-1").digest("base64url");
const ORIGIN = "https://app.example.test";

function deliveryRequest(
  reference = "A".repeat(43),
  recipient = "person@example.test",
) {
  return {
    version: "1.0.0",
    purpose: "verify-email",
    recipient,
    actionUrl: `${ORIGIN}/api/auth/verify-email?token=a.b.c&callbackURL=%2F`,
    templateVersion: "auth.verify-email.en-CA.1",
    idempotencyReference: reference,
  } as const;
}

function fakePool() {
  let row: Record<string, unknown> | null = null;
  const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("select reference_key_version"))
      return { rows: row ? [{ ...row }] : [] };
    if (sql.includes("insert into authentication_email_delivery")) {
      row = {
        reference_key_version: parameters![2],
        reference_digest: parameters![3],
        request_digest: parameters![4],
        state: "reserved",
        lease_expires_at: parameters![6],
      };
    }
    if (sql.includes("set state = 'reconciliation-required'"))
      row = { ...row, state: "reconciliation-required" };
    if (sql.includes("set state = $2")) row = { ...row, state: parameters![1] };
    return { rows: [] };
  });
  const release = vi.fn();
  return {
    pool: { connect: async () => ({ query, release }) as never },
    query,
    release,
    row: () => row,
  };
}

describe("authentication email idempotency keys", () => {
  it("loads descending canonical server-only rollover keys and a bounded lease", () => {
    expect(
      loadAuthenticationEmailIdempotencyConfiguration({
        AUTH_EMAIL_IDEMPOTENCY_KEYS: `2:${KEY_2},1:${KEY_1}`,
        AUTH_EMAIL_IDEMPOTENCY_LEASE_SECONDS: "120",
      }),
    ).toEqual({
      keys: [
        { version: 2, value: KEY_2 },
        { version: 1, value: KEY_1 },
      ],
      leaseMilliseconds: 120_000,
    });
  });

  it("derives stable, purpose-separated, opaque 256-bit references", () => {
    const factory = createAuthenticationEmailIdempotencyReferenceFactory({
      keys: [{ version: 2, value: KEY_2 }],
      leaseMilliseconds: 120_000,
    });
    const first = factory.create({ purpose: "verify-email", token: "secret" });
    const replay = factory.create({ purpose: "verify-email", token: "secret" });
    const reset = factory.create({
      purpose: "reset-password",
      token: "secret",
    });

    expect(first).toBe(replay);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(reset).not.toBe(first);
    expect(first).not.toContain("secret");
  });

  it.each([
    {},
    { AUTH_EMAIL_IDEMPOTENCY_KEYS: `1:${KEY_1},2:${KEY_2}` },
    { AUTH_EMAIL_IDEMPOTENCY_KEYS: `2:${KEY_2},1:${KEY_2}` },
    { AUTH_EMAIL_IDEMPOTENCY_KEYS: "1:short" },
    {
      AUTH_EMAIL_IDEMPOTENCY_KEYS: `1:${KEY_1}`,
      AUTH_EMAIL_IDEMPOTENCY_LEASE_SECONDS: "29",
    },
    {
      AUTH_EMAIL_IDEMPOTENCY_KEYS: `1:${KEY_1}`,
      NEXT_PUBLIC_AUTH_EMAIL_IDEMPOTENCY_KEYS: KEY_1,
    },
  ])(
    "rejects missing, unsafe, or browser-exposed key configuration",
    (value) => {
      expect(() =>
        loadAuthenticationEmailIdempotencyConfiguration(value),
      ).toThrow(AuthenticationEmailConfigurationError);
    },
  );

  it("rolls back and releases the pooled client after a database failure", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("select reference_key_version")) return { rows: [] };
      if (sql.includes("insert into authentication_email_delivery"))
        throw new Error("database fixture failure");
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new AuthenticationEmailIdempotencyRepository(
      { connect: async () => ({ query, release }) as never },
      {
        keys: [{ version: 1, value: KEY_1 }],
        leaseMilliseconds: 120_000,
      },
      "https://app.example.test",
      () => new Date("2026-08-12T12:00:00.000Z"),
    );

    await expect(
      repository.reserve({
        version: "1.0.0",
        purpose: "verify-email",
        recipient: "person@example.test",
        actionUrl:
          "https://app.example.test/api/auth/verify-email?token=a.b.c&callbackURL=%2F",
        templateVersion: "auth.verify-email.en-CA.1",
        idempotencyReference: "A".repeat(43),
      }),
    ).rejects.toThrow("database fixture failure");
    expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
    expect(release).toHaveBeenCalledOnce();
  });

  it.each(["", "control\nvalue", "x".repeat(4097)])(
    "rejects unsafe raw token input without reflection",
    (token) => {
      const factory = createAuthenticationEmailIdempotencyReferenceFactory({
        keys: [{ version: 1, value: KEY_1 }],
        leaseMilliseconds: 120_000,
      });
      expect(() => factory.create({ purpose: "verify-email", token })).toThrow(
        "Authentication email configuration is unavailable",
      );
    },
  );
});

describe("authentication email idempotency repository", () => {
  const configuration = {
    keys: [{ version: 1, value: KEY_1 }],
    leaseMilliseconds: 60_000,
  } as const;

  it("reserves, recognizes replay, and stores only keyed digests", async () => {
    const database = fakePool();
    const repository = new AuthenticationEmailIdempotencyRepository(
      database.pool,
      configuration,
      ORIGIN,
      () => new Date("2026-08-12T12:00:00Z"),
    );
    await expect(repository.reserve(deliveryRequest())).resolves.toEqual({
      version: "1.0.0",
      outcome: "reserved",
    });
    await expect(repository.reserve(deliveryRequest())).resolves.toEqual({
      version: "1.0.0",
      outcome: "in-progress",
    });
    expect(JSON.stringify(database.row())).not.toContain("person@example.test");
    expect(JSON.stringify(database.row())).not.toContain("a.b.c");
    expect(JSON.stringify(database.row())).toMatch(
      /hmac-sha256:1:[0-9a-f]{64}/,
    );
  });

  it("detects collision and binds terminal accepted state once", async () => {
    const database = fakePool();
    const repository = new AuthenticationEmailIdempotencyRepository(
      database.pool,
      configuration,
      ORIGIN,
      () => new Date("2026-08-12T12:00:00Z"),
    );
    await repository.reserve(deliveryRequest());
    await expect(
      repository.reserve(deliveryRequest("A".repeat(43), "other@example.test")),
    ).resolves.toMatchObject({ outcome: "collision" });
    await expect(
      repository.complete(
        deliveryRequest(),
        { version: "1.0.0", disposition: "accepted", code: "EMAIL_ACCEPTED" },
        "ses-message-1",
      ),
    ).resolves.toMatchObject({ outcome: "accepted" });
    await expect(
      repository.complete(deliveryRequest(), {
        version: "1.0.0",
        disposition: "retry",
        code: "EMAIL_RETRY",
      }),
    ).resolves.toMatchObject({ outcome: "accepted" });
  });

  it("returns reconciliation for missing and expired reservations", async () => {
    const missing = fakePool();
    const missingRepository = new AuthenticationEmailIdempotencyRepository(
      missing.pool,
      configuration,
      ORIGIN,
    );
    await expect(
      missingRepository.complete(deliveryRequest(), {
        version: "1.0.0",
        disposition: "retry",
        code: "EMAIL_RETRY",
      }),
    ).resolves.toMatchObject({ outcome: "reconciliation-required" });

    const expired = fakePool();
    let now = new Date("2026-08-12T12:00:00Z");
    const repository = new AuthenticationEmailIdempotencyRepository(
      expired.pool,
      configuration,
      ORIGIN,
      () => now,
    );
    const reference = createHash("sha256")
      .update("expired")
      .digest("base64url");
    await repository.reserve(deliveryRequest(reference));
    now = new Date("2026-08-12T12:01:01Z");
    await expect(
      repository.reserve(deliveryRequest(reference)),
    ).resolves.toMatchObject({ outcome: "reconciliation-required" });
  });

  it("rejects malformed clocks, origins, keys, and provider-reference use", async () => {
    expect(
      () =>
        new AuthenticationEmailIdempotencyRepository(
          fakePool().pool,
          configuration,
          "http://app.example.test",
        ),
    ).toThrow(AuthenticationEmailConfigurationError);
    expect(
      () =>
        new AuthenticationEmailIdempotencyRepository(
          fakePool().pool,
          configuration,
          ORIGIN,
          () => new Date("invalid"),
        ),
    ).toThrow(AuthenticationEmailConfigurationError);

    const database = fakePool();
    const repository = new AuthenticationEmailIdempotencyRepository(
      database.pool,
      configuration,
      ORIGIN,
    );
    await expect(
      repository.complete(deliveryRequest(), {
        version: "1.0.0",
        disposition: "accepted",
        code: "EMAIL_ACCEPTED",
      }),
    ).rejects.toThrow(AuthenticationEmailConfigurationError);
    await expect(
      repository.complete(
        deliveryRequest(),
        { version: "1.0.0", disposition: "retry", code: "EMAIL_RETRY" },
        "not-allowed",
      ),
    ).rejects.toThrow(AuthenticationEmailConfigurationError);
  });
});
