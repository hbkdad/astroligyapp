import { describe, expect, it, vi } from "vitest";

import type { Paddle } from "@paddle/paddle-node-sdk";

vi.mock("server-only", () => ({}));

import type { AccountId } from "@/infrastructure/auth/account";
import type { BillingCustomerIdentity } from "@/infrastructure/persistence/billing-customer-binding-repository";
import {
  BillingCustomerProvisioner,
  type BillingCustomerBindingStore,
} from "@/server/billing-customer-provisioning";
import {
  createPaddleCustomerProviderAdapter,
  type PaddleCustomerClient,
} from "@/server/paddle-customer-provider-adapter";

const EMAIL = "owner@example.com";
const CUSTOMER_A = `ctm_${"a".repeat(26)}`;
const CUSTOMER_B = `ctm_${"b".repeat(26)}`;
const OWNER = "10000000-0000-4000-8000-000000000001" as AccountId;

function customer(
  overrides: Partial<{ id: string; email: string; status: string }> = {},
) {
  return {
    id: CUSTOMER_A,
    email: EMAIL,
    status: "active",
    name: null,
    ...overrides,
  };
}

function iterable(value: readonly unknown[] | Error): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      if (value instanceof Error) throw value;
      yield* value;
    },
  };
}

function client(
  lists: Array<readonly unknown[] | Error>,
  createResult: unknown | Error = customer(),
) {
  const list = vi.fn(
    (_query?: Parameters<PaddleCustomerClient["customers"]["list"]>[0]) => {
      void _query;
      return iterable(lists.shift() ?? []);
    },
  );
  const create = vi.fn(
    async (
      _request: Parameters<PaddleCustomerClient["customers"]["create"]>[0],
    ) => {
      void _request;
      if (createResult instanceof Error) throw createResult;
      return createResult;
    },
  );
  return { customers: { list, create } } satisfies PaddleCustomerClient;
}

function request(email = EMAIL) {
  return { contact: { email } };
}

describe("Paddle customer provider adapter", () => {
  it("accepts the installed Paddle 3.10.0 customer resource structurally", () => {
    const compatible: Pick<Paddle, "customers"> extends PaddleCustomerClient
      ? true
      : false = true;
    expect(compatible).toBe(true);
  });

  it("returns one exact active existing customer without create", async () => {
    const paddle = client([[customer()]]);
    const result =
      await createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      );
    expect(result).toEqual({
      status: "ready",
      customerReference: CUSTOMER_A,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(paddle.customers.list).toHaveBeenCalledWith({
      email: [EMAIL],
      status: ["active"],
      perPage: 2,
    });
    expect(paddle.customers.create).not.toHaveBeenCalled();
  });

  it("creates only after an exact-email lookup returns none", async () => {
    const paddle = client([[]]);
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).resolves.toEqual({
      status: "ready",
      customerReference: CUSTOMER_A,
    });
    expect(paddle.customers.create).toHaveBeenCalledWith({ email: EMAIL });
    expect(paddle.customers.create.mock.calls[0]![0]).not.toHaveProperty(
      "customData",
    );
  });

  it("accepts provider email casing only after normalized equality", async () => {
    const paddle = client([[customer({ email: "Owner@Example.com" })]]);
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).resolves.toMatchObject({ status: "ready" });
  });

  it("returns reconciliation-required for multiple exact matches", async () => {
    const paddle = client([[customer(), customer({ id: CUSTOMER_B })]]);
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).resolves.toEqual({ status: "reconciliation-required" });
    expect(paddle.customers.create).not.toHaveBeenCalled();
  });

  it.each([
    customer({ status: "archived" }),
    customer({ email: "other@example.com" }),
    customer({ id: "ctm_invalid" }),
    null,
  ])("fails closed for malformed lookup customer %#", async (candidate) => {
    const paddle = client([[candidate]]);
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).resolves.toEqual({ status: "reconciliation-required" });
    expect(paddle.customers.create).not.toHaveBeenCalled();
  });

  it("throws an initial lookup outage because no mutation was attempted", async () => {
    const paddle = client([new Error("nested")]);
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).rejects.toThrow("nested");
    expect(paddle.customers.create).not.toHaveBeenCalled();
  });

  it("throws for a malformed SDK collection before attempting mutation", async () => {
    const paddle = client([]);
    paddle.customers.list.mockReturnValueOnce(null as never);
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).rejects.toThrow("Paddle customer collection is invalid");
    expect(paddle.customers.create).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { contact: { email: EMAIL }, ownerId: "browser-owner" },
    { contact: { email: "Owner@example.com" } },
    { contact: { email: "invalid" } },
    { contact: { email: EMAIL, customData: { owner: true } } },
  ])("rejects invalid adapter request %# without SDK calls", async (value) => {
    const paddle = client([]);
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        value as never,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid-contact" });
    expect(paddle.customers.list).not.toHaveBeenCalled();
    expect(paddle.customers.create).not.toHaveBeenCalled();
  });

  it.each(["customer_email_invalid", "customer_email_domain_not_allowed"])(
    "maps definite non-mutating create error %s to contact rejection",
    async (code) => {
      const error = Object.assign(new Error("private detail"), { code });
      const paddle = client([[]], error);
      await expect(
        createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
          request(),
        ),
      ).resolves.toEqual({ status: "rejected", reason: "invalid-contact" });
      expect(paddle.customers.list).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    "customer_already_exists",
    "network_error",
    "authentication_failed",
  ])("re-queries after potentially ambiguous create error %s", async (code) => {
    const error = Object.assign(new Error(`private ${CUSTOMER_A}`), { code });
    const paddle = client([[], [customer()]], error);
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).resolves.toEqual({
      status: "ready",
      customerReference: CUSTOMER_A,
    });
    expect(paddle.customers.list).toHaveBeenCalledTimes(2);
  });

  it("re-queries after a malformed create response", async () => {
    const paddle = client([[], [customer()]], { id: "unexpected" });
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).resolves.toMatchObject({
      status: "ready",
      customerReference: CUSTOMER_A,
    });
  });

  it.each([
    [[], new Error("timeout")],
    [[customer(), customer({ id: CUSTOMER_B })], new Error("timeout")],
    [[customer({ status: "archived" })], new Error("timeout")],
  ] as const)(
    "does not retry an unsafe create when reconciliation is not unique %#",
    async (requery, createError) => {
      const paddle = client([[], requery], createError);
      await expect(
        createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
          request(),
        ),
      ).resolves.toEqual({ status: "reconciliation-required" });
      expect(paddle.customers.create).toHaveBeenCalledTimes(1);
    },
  );

  it("returns reconciliation-required when the post-create lookup fails", async () => {
    const paddle = client(
      [[], new Error("lookup private")],
      new Error("timeout"),
    );
    await expect(
      createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      ),
    ).resolves.toEqual({ status: "reconciliation-required" });
  });

  it("never reflects contact, customer, or provider error data", async () => {
    const paddle = client([[], []], new Error(`failed ${EMAIL} ${CUSTOMER_A}`));
    const result =
      await createPaddleCustomerProviderAdapter(paddle).findOrProvisionCustomer(
        request(),
      );
    expect(JSON.stringify(result)).toBe('{"status":"reconciliation-required"}');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("composes with provisioning and binds only the verified Paddle identity", async () => {
    const paddle = client([[]]);
    const bind = vi.fn(
      async (_ownerId: AccountId, identity: BillingCustomerIdentity) => ({
        outcome: "created" as const,
        identity,
      }),
    );
    const bindings: BillingCustomerBindingStore = {
      findForProvider: vi.fn(async () => null),
      bind,
    };
    const provisioner = new BillingCustomerProvisioner(
      createPaddleCustomerProviderAdapter(paddle),
      bindings,
    );

    await expect(
      provisioner.provision({ ownerId: OWNER, contact: { email: EMAIL } }),
    ).resolves.toMatchObject({ disposition: "ready", code: "bound" });
    expect(bind).toHaveBeenCalledWith(OWNER, {
      provider: "paddle",
      customerReference: CUSTOMER_A,
    });
  });
});
