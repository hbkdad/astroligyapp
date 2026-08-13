import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PrivateProfileRepository } from "@/infrastructure/persistence/private-profile-repository";
import type { AccountId } from "@/infrastructure/auth/account";

const OWNER = "11111111-1111-4111-8111-111111111111" as AccountId;
const NOW = new Date("2026-08-13T12:00:00.000Z");

describe("private profile repository transactions", () => {
  it("rolls back and releases when the birth insert fails after profile creation", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (
        sql ===
        "select count(*)::text as count from profile where deleted_at is null"
      )
        return { rows: [{ count: "0" }], rowCount: 1 };
      if (sql.startsWith("insert into profile"))
        return {
          rows: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              revision: 1,
            },
          ],
          rowCount: 1,
        };
      if (sql.startsWith("insert into birth_profile"))
        throw new Error("deliberate birth insert failure");
      return { rows: [], rowCount: 0 };
    });
    const repository = new PrivateProfileRepository(
      { connect: vi.fn(async () => ({ query, release })) } as never,
      () => NOW,
    );

    await expect(
      repository.mutate(OWNER, {
        version: "1.0.0",
        operation: "create",
        value: {
          displayName: "Rollback fixture",
          currentTimezone: "America/Toronto",
          birthDate: "1990-01-01",
          birthTimePrecision: "date-only",
          birthTimeLocal: null,
          birthTimezone: "America/Toronto",
          latitude: null,
          longitude: null,
        },
      }),
    ).rejects.toThrow("deliberate birth insert failure");
    expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
    expect(release).toHaveBeenCalledOnce();
  });
});
