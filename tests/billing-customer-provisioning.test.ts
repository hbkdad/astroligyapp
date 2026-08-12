import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccountId } from "@/infrastructure/auth/account";
import type {
  BillingCustomerBindingResult,
  BillingCustomerIdentity,
} from "@/infrastructure/persistence/billing-customer-binding-repository";
import {
  BILLING_CUSTOMER_PROVISIONING_VERSION,
  BillingCustomerProvisioner,
  type BillingCustomerBindingStore,
  type BillingCustomerProvider,
  type BillingCustomerProviderRequest,
  type BillingCustomerProviderResult,
} from "@/server/billing-customer-provisioning";

const OWNER_A = "10000000-0000-4000-8000-000000000001" as AccountId;
const OWNER_B = "20000000-0000-4000-8000-000000000002" as AccountId;
const CUSTOMER = "ctm_test_customer";

function request(ownerId: AccountId = OWNER_A, email = "Owner@Example.com") {
  return { ownerId, contact: { email } };
}

function provider(
  implementation: (
    value: BillingCustomerProviderRequest,
  ) => Promise<BillingCustomerProviderResult> = async () => ({
    status: "ready",
    customerReference: CUSTOMER,
  }),
): BillingCustomerProvider & {
  findOrProvisionCustomer: ReturnType<typeof vi.fn>;
} {
  return {
    providerKey: "paddle",
    findOrProvisionCustomer: vi.fn(implementation),
  };
}

function bindings(overrides: Partial<BillingCustomerBindingStore> = {}) {
  const findForProvider = vi.fn<BillingCustomerBindingStore["findForProvider"]>(
    async () => null,
  );
  const bind = vi.fn<BillingCustomerBindingStore["bind"]>(
    async (
      _ownerId: AccountId,
      identity: BillingCustomerIdentity,
    ): Promise<BillingCustomerBindingResult> => ({
      outcome: "created",
      identity,
    }),
  );
  if (overrides.findForProvider)
    findForProvider.mockImplementation(overrides.findForProvider);
  if (overrides.bind) bind.mockImplementation(overrides.bind);
  return { findForProvider, bind };
}

class TestBindingConflictError extends Error {
  override name = "BillingCustomerBindingConflictError";
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe("billing customer provisioning", () => {
  it("provisions and binds a customer without returning identity or contact data", async () => {
    const adapter = provider();
    const store = bindings();
    const result = await new BillingCustomerProvisioner(
      adapter,
      store,
    ).provision(request());

    expect(result).toEqual({
      version: BILLING_CUSTOMER_PROVISIONING_VERSION,
      disposition: "ready",
      code: "bound",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /owner@example|ctm_test|10000000|paddle/i,
    );
    expect(store.bind).toHaveBeenCalledWith(OWNER_A, {
      provider: "paddle",
      customerReference: CUSTOMER,
    });
  });

  it("normalizes and freezes the server-trusted contact", async () => {
    const adapter = provider();
    const provisioner = new BillingCustomerProvisioner(adapter, bindings());
    await provisioner.provision(request());
    const first = adapter.findOrProvisionCustomer.mock.calls[0]![0];

    await provisioner.provision(request());
    const second = adapter.findOrProvisionCustomer.mock.calls[1]![0];
    expect(first.contact).toEqual({ email: "owner@example.com" });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.contact)).toBe(true);
    expect(second.contact).toEqual(first.contact);
  });

  it("returns an existing binding without calling the provider", async () => {
    const adapter = provider();
    const store = bindings({
      findForProvider: vi.fn(async () => ({
        provider: "paddle",
        customerReference: CUSTOMER,
      })),
    });
    await expect(
      new BillingCustomerProvisioner(adapter, store).provision(request()),
    ).resolves.toEqual({
      version: BILLING_CUSTOMER_PROVISIONING_VERSION,
      disposition: "ready",
      code: "existing",
    });
    expect(adapter.findOrProvisionCustomer).not.toHaveBeenCalled();
    expect(store.bind).not.toHaveBeenCalled();
  });

  it("treats repository existing-after-provision as a safe ready result", async () => {
    const store = bindings({
      bind: vi.fn(
        async (_ownerId, identity): Promise<BillingCustomerBindingResult> => ({
          outcome: "existing",
          identity,
        }),
      ),
    });
    await expect(
      new BillingCustomerProvisioner(provider(), store).provision(request()),
    ).resolves.toMatchObject({ disposition: "ready", code: "existing" });
  });

  it.each([
    null,
    {},
    { ownerId: OWNER_A, contact: { email: "owner@example.com" }, extra: true },
    { ownerId: "browser-owner", contact: { email: "owner@example.com" } },
    { ownerId: OWNER_A, contact: { email: "not-an-email" } },
    { ownerId: OWNER_A, contact: { email: " owner@example.com" } },
    {
      ownerId: OWNER_A,
      contact: { email: "owner@example.com", owner: OWNER_A },
    },
  ])(
    "rejects invalid or browser-shaped requests without dependencies",
    async (value) => {
      const adapter = provider();
      const store = bindings();
      await expect(
        new BillingCustomerProvisioner(adapter, store).provision(value),
      ).resolves.toMatchObject({
        disposition: "reject",
        code: "invalid-request",
      });
      expect(adapter.findOrProvisionCustomer).not.toHaveBeenCalled();
      expect(store.findForProvider).not.toHaveBeenCalled();
    },
  );

  it.each(["", "Paddle", "paddle.com", "paddle/../../owner", "p".repeat(65)])(
    "fails closed for invalid provider key %j",
    async (providerKey) => {
      const adapter = { ...provider(), providerKey };
      await expect(
        new BillingCustomerProvisioner(adapter, bindings()).provision(
          request(),
        ),
      ).resolves.toMatchObject({
        disposition: "reconcile",
        code: "provider-contract-invalid",
      });
      expect(adapter.findOrProvisionCustomer).not.toHaveBeenCalled();
    },
  );

  it("maps provider contact rejection without reflecting details", async () => {
    const adapter = provider(async () => ({
      status: "rejected",
      reason: "invalid-contact",
    }));
    await expect(
      new BillingCustomerProvisioner(adapter, bindings()).provision(request()),
    ).resolves.toMatchObject({
      disposition: "reject",
      code: "invalid-contact",
    });
  });

  it("preserves an ambiguous provider create as reconciliation-required", async () => {
    const adapter = provider(async () => ({
      status: "reconciliation-required",
    }));
    const store = bindings();
    await expect(
      new BillingCustomerProvisioner(adapter, store).provision(request()),
    ).resolves.toMatchObject({
      disposition: "reconcile",
      code: "provider-reconciliation-required",
    });
    expect(store.bind).not.toHaveBeenCalled();
  });

  it("maps provider failure to a retry and permits a later retry", async () => {
    const adapter = provider(
      vi
        .fn()
        .mockRejectedValueOnce(new Error(`secret ${CUSTOMER}`))
        .mockResolvedValueOnce({
          status: "ready",
          customerReference: CUSTOMER,
        }),
    );
    const provisioner = new BillingCustomerProvisioner(adapter, bindings());
    await expect(provisioner.provision(request())).resolves.toMatchObject({
      disposition: "retry",
      code: "provider-unavailable",
    });
    await expect(provisioner.provision(request())).resolves.toMatchObject({
      disposition: "ready",
      code: "bound",
    });
    expect(adapter.findOrProvisionCustomer).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    { status: "ready", customerReference: "bad customer" },
    { status: "ready", customerReference: CUSTOMER, extra: true },
    { status: "rejected", reason: "provider-detail" },
  ])("reconciles malformed provider result %#", async (providerResult) => {
    const adapter = provider(async () => providerResult as never);
    await expect(
      new BillingCustomerProvisioner(adapter, bindings()).provision(request()),
    ).resolves.toMatchObject({
      disposition: "reconcile",
      code: "provider-contract-invalid",
    });
  });

  it("maps lookup and ordinary binding failures to safe retry results", async () => {
    const lookupFailure = bindings({
      findForProvider: vi.fn(async () => {
        throw new Error(`database ${OWNER_A}`);
      }),
    });
    await expect(
      new BillingCustomerProvisioner(provider(), lookupFailure).provision(
        request(),
      ),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "binding-unavailable",
    });

    const bindFailure = bindings({
      bind: vi.fn(async () => {
        throw new Error(`database ${CUSTOMER}`);
      }),
    });
    await expect(
      new BillingCustomerProvisioner(provider(), bindFailure).provision(
        request(),
      ),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "binding-unavailable",
    });
  });

  it("marks post-provider binding conflicts for reconciliation", async () => {
    const store = bindings({
      bind: vi.fn(async () => {
        throw new TestBindingConflictError();
      }),
    });
    await expect(
      new BillingCustomerProvisioner(provider(), store).provision(request()),
    ).resolves.toMatchObject({
      disposition: "reconcile",
      code: "binding-conflict",
    });
  });

  it.each([
    {
      outcome: "created",
      identity: { provider: "other", customerReference: CUSTOMER },
    },
    {
      outcome: "created",
      identity: { provider: "paddle", customerReference: "other" },
    },
    {
      outcome: "unknown",
      identity: { provider: "paddle", customerReference: CUSTOMER },
    },
  ])("reconciles malformed binding result %#", async (bindingResult) => {
    const store = bindings({ bind: vi.fn(async () => bindingResult as never) });
    await expect(
      new BillingCustomerProvisioner(provider(), store).provision(request()),
    ).resolves.toMatchObject({
      disposition: "reconcile",
      code: "binding-conflict",
    });
  });

  it("reconciles a malformed existing binding without provider mutation", async () => {
    const adapter = provider();
    const store = bindings({
      findForProvider: vi.fn(async () => ({
        provider: "other",
        customerReference: CUSTOMER,
      })),
    });
    await expect(
      new BillingCustomerProvisioner(adapter, store).provision(request()),
    ).resolves.toMatchObject({
      disposition: "reconcile",
      code: "binding-conflict",
    });
    expect(adapter.findOrProvisionCustomer).not.toHaveBeenCalled();
  });

  it("single-flights concurrent first provisioning for one owner/provider", async () => {
    const pending = deferred<BillingCustomerProviderResult>();
    const adapter = provider(async () => pending.promise);
    const provisioner = new BillingCustomerProvisioner(adapter, bindings());
    const first = provisioner.provision(request());
    const second = provisioner.provision(request());

    expect(first).toBe(second);
    await vi.waitFor(() =>
      expect(adapter.findOrProvisionCustomer).toHaveBeenCalledTimes(1),
    );
    pending.resolve({ status: "ready", customerReference: CUSTOMER });
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ disposition: "ready" }),
      expect.objectContaining({ disposition: "ready" }),
    ]);
  });

  it("does not coalesce different verified owners", async () => {
    const adapter = provider();
    const provisioner = new BillingCustomerProvisioner(adapter, bindings());
    await Promise.all([
      provisioner.provision(request()),
      provisioner.provision(request(OWNER_B)),
    ]);
    expect(adapter.findOrProvisionCustomer).toHaveBeenCalledTimes(2);
  });
});
