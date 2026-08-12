import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BillingCustomerOwnerResolver } from "@/infrastructure/persistence/billing-customer-binding-repository";

const OWNER_ID = "10000000-0000-4000-8000-000000000001";

function harness(
  resolveResult: unknown = { rowCount: 1, rows: [{ owner_id: OWNER_ID }] },
  options: Readonly<{ failRollback?: boolean }> = {},
) {
  const query = vi.fn(async (statement: string) => {
    if (statement.startsWith("select app.resolve")) {
      if (resolveResult instanceof Error) throw resolveResult;
      return resolveResult;
    }
    if (statement === "rollback" && options.failRollback)
      throw new Error("rollback failed");
    return { rowCount: null, rows: [] };
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return {
    resolver: new BillingCustomerOwnerResolver({ connect } as never),
    connect,
    query,
    release,
  };
}

describe("billing customer owner resolver transaction boundary", () => {
  it("uses only the resolver role/function and commits before release", async () => {
    const { resolver, connect, query, release } = harness();

    await expect(
      resolver.resolveOwner("paddle", `ctm_${"c".repeat(26)}`),
    ).resolves.toBe(OWNER_ID);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls).toEqual([
      ["begin"],
      ["set local role app_billing_resolver"],
      [
        "select app.resolve_billing_customer_owner($1, $2) as owner_id",
        ["paddle", `ctm_${"c".repeat(26)}`],
      ],
      ["commit"],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("returns null for a well-formed unbound customer", async () => {
    const { resolver } = harness({ rowCount: 1, rows: [{ owner_id: null }] });
    await expect(
      resolver.resolveOwner("paddle", `ctm_${"u".repeat(26)}`),
    ).resolves.toBeNull();
  });

  it.each([
    { rowCount: 0, rows: [] },
    { rowCount: 2, rows: [{ owner_id: OWNER_ID }, { owner_id: OWNER_ID }] },
    { rowCount: 1, rows: [{ owner_id: "not-a-uuid" }] },
  ])("rolls back malformed privileged results", async (result) => {
    const { resolver, query, release } = harness(result);
    await expect(
      resolver.resolveOwner("paddle", `ctm_${"c".repeat(26)}`),
    ).rejects.toThrow("Billing owner resolver result is invalid");
    expect(query).toHaveBeenLastCalledWith("rollback");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("preserves the original database failure when rollback also fails", async () => {
    const original = new Error("database unavailable");
    const { resolver, query, release } = harness(original, {
      failRollback: true,
    });
    await expect(
      resolver.resolveOwner("paddle", `ctm_${"c".repeat(26)}`),
    ).rejects.toBe(original);
    expect(query).toHaveBeenLastCalledWith("rollback");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Paddle", `ctm_${"c".repeat(26)}`],
    ["paddle", "contains whitespace"],
  ])(
    "rejects unsafe input before obtaining a connection",
    async (provider, customer) => {
      const { resolver, connect } = harness();
      await expect(resolver.resolveOwner(provider, customer)).rejects.toThrow(
        "Billing customer identity is invalid",
      );
      expect(connect).not.toHaveBeenCalled();
    },
  );
});
