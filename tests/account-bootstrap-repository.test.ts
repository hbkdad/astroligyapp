import { describe, expect, it, vi } from "vitest";

import {
  AccountUnavailableError,
  bootstrapAccount,
} from "@/infrastructure/auth/account";
import type { ActiveSession } from "@/infrastructure/auth/session";

const OWNER = "11111111-1111-4111-8111-111111111111";
const session: ActiveSession = {
  status: "active",
  subject: "verified-subject",
  sessionId: "verified-session",
  authenticatedAt: new Date("2026-08-12T11:59:00.000Z"),
  expiresAt: new Date("2026-08-12T13:00:00.000Z"),
};

describe("least-privilege account bootstrap repository", () => {
  it("calls only the execute-only bootstrap function inside a local role transaction", async () => {
    const query = vi.fn(async (statement: string, parameters?: unknown[]) => ({
      rows: statement.includes("bootstrap_auth_account") ? [{ id: OWNER }] : [],
      rowCount: null,
      parameters,
    }));
    const release = vi.fn();
    await expect(
      bootstrapAccount(
        {
          connect: async () => ({ query, release }) as never,
        },
        session,
      ),
    ).resolves.toBe(OWNER);
    expect(query.mock.calls).toEqual([
      ["begin"],
      ["set local role app_auth_account_bootstrap"],
      ["select app.bootstrap_auth_account($1) as id", [session.subject]],
      ["commit"],
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toMatch(
      /insert into user_account|update user_account|verified-session/,
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back, releases, and rejects missing or malformed function results", async () => {
    for (const id of [null, "not-a-uuid"]) {
      const query = vi.fn(async (statement: string) => ({
        rows: statement.includes("bootstrap_auth_account") ? [{ id }] : [],
        rowCount: null,
      }));
      const release = vi.fn();
      await expect(
        bootstrapAccount(
          { connect: async () => ({ query, release }) as never },
          session,
        ),
      ).rejects.toEqual(new AccountUnavailableError());
      expect(query.mock.calls.map(([statement]) => statement)).toContain(
        "rollback",
      );
      expect(release).toHaveBeenCalledOnce();
    }
  });

  it("preserves the first database failure if rollback also fails", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement === "rollback") throw new Error("rollback detail");
      if (statement.includes("bootstrap_auth_account"))
        throw new Error("original bootstrap detail");
      return { rows: [], rowCount: null };
    });
    const release = vi.fn();
    await expect(
      bootstrapAccount(
        { connect: async () => ({ query, release }) as never },
        session,
      ),
    ).rejects.toThrow("original bootstrap detail");
    expect(release).toHaveBeenCalledOnce();
  });
});
