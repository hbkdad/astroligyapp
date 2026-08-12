import { describe, expect, it, vi } from "vitest";

import {
  AccountUnavailableError,
  LocalAccountDeletionRepository,
  type AccountId,
} from "@/infrastructure/auth/account";
import type { ActiveSession } from "@/infrastructure/auth/session";

const OWNER = "11111111-1111-4111-8111-111111111111" as AccountId;
const session: ActiveSession = {
  status: "active",
  subject: "verified-subject",
  sessionId: "recent-session",
  authenticatedAt: new Date("2026-08-12T11:59:00.000Z"),
  expiresAt: new Date("2026-08-12T13:00:00.000Z"),
};

function fixture(outcome: unknown = "deleted") {
  const query = vi.fn(async (statement: string, parameters?: unknown[]) => ({
    rows: statement.includes("erase_local_auth_account") ? [{ outcome }] : [],
    rowCount: null,
    parameters,
  }));
  const release = vi.fn();
  return {
    repository: new LocalAccountDeletionRepository({
      connect: async () => ({ query, release }) as never,
    }),
    query,
    release,
  };
}

describe("local account deletion repository", () => {
  it.each(["deleted", "reconciliation-required", "unavailable"] as const)(
    "returns the exact safe function outcome %s",
    async (outcome) => {
      const value = fixture(outcome);
      await expect(value.repository.erase(session, OWNER)).resolves.toBe(
        outcome,
      );
      expect(value.query.mock.calls).toEqual([
        ["begin"],
        ["set local role app_account_deletion"],
        [
          "select app.erase_local_auth_account($1, $2, $3) as outcome",
          [session.subject, session.sessionId, OWNER],
        ],
        ["commit"],
      ]);
      expect(JSON.stringify(value.query.mock.calls)).not.toMatch(
        /delete from|update user_account/,
      );
      expect(value.release).toHaveBeenCalledOnce();
    },
  );

  it("rejects a malformed owner before opening a database connection", async () => {
    const connect = vi.fn();
    const repository = new LocalAccountDeletionRepository({ connect });
    await expect(
      repository.erase(session, "attacker-owner" as AccountId),
    ).rejects.toEqual(new AccountUnavailableError());
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([null, "other", {}, []])(
    "rolls back malformed database outcome without committing",
    async (outcome) => {
      const value = fixture(outcome);
      await expect(value.repository.erase(session, OWNER)).rejects.toEqual(
        new AccountUnavailableError(),
      );
      expect(value.query.mock.calls.map(([statement]) => statement)).toContain(
        "rollback",
      );
      expect(
        value.query.mock.calls.map(([statement]) => statement),
      ).not.toContain("commit");
      expect(value.release).toHaveBeenCalledOnce();
    },
  );

  it("preserves database failure when rollback also fails", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement === "rollback") throw new Error("rollback detail");
      if (statement.includes("erase_local_auth_account"))
        throw new Error("original deletion detail");
      return { rows: [], rowCount: null };
    });
    const release = vi.fn();
    const repository = new LocalAccountDeletionRepository({
      connect: async () => ({ query, release }) as never,
    });
    await expect(repository.erase(session, OWNER)).rejects.toThrow(
      "original deletion detail",
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
