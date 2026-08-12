import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccountId } from "@/infrastructure/auth/account";
import type {
  ActiveSession,
  SessionVerification,
} from "@/infrastructure/auth/session";
import {
  AUTHENTICATED_BILLING_PROVISIONING_VERSION,
  provisionBillingCustomerForRequest,
  type AuthenticatedBillingProvisioningDependencies,
} from "@/server/authenticated-billing-customer-provisioning";
import type { BillingCustomerProvisioningResult } from "@/server/billing-customer-provisioning";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const OWNER = "10000000-0000-4000-8000-000000000001" as AccountId;
const EMAIL = "Owner@Example.com";

function activeSession(): ActiveSession {
  return {
    status: "active",
    subject: "provider-subject",
    sessionId: "session-id",
    authenticatedAt: new Date(NOW.getTime() - 1_000),
    expiresAt: new Date(NOW.getTime() + 60_000),
  };
}

function provisioning(
  disposition: BillingCustomerProvisioningResult["disposition"] = "ready",
): BillingCustomerProvisioningResult {
  const codes = {
    ready: "bound",
    reject: "invalid-contact",
    retry: "provider-unavailable",
    reconcile: "provider-reconciliation-required",
  } as const;
  return {
    version: "1.0.0",
    disposition,
    code: codes[disposition],
  } as BillingCustomerProvisioningResult;
}

function dependencies(
  session: SessionVerification = activeSession(),
): AuthenticatedBillingProvisioningDependencies & {
  sessionVerifier: { verify: ReturnType<typeof vi.fn> };
  accountResolver: { resolveActiveAccount: ReturnType<typeof vi.fn> };
  contactResolver: { resolveTrustedContact: ReturnType<typeof vi.fn> };
  customerProvisioner: { provision: ReturnType<typeof vi.fn> };
} {
  return {
    sessionVerifier: { verify: vi.fn(async () => session) },
    accountResolver: { resolveActiveAccount: vi.fn(async () => OWNER) },
    contactResolver: {
      resolveTrustedContact: vi.fn(async () => ({ email: EMAIL })),
    },
    customerProvisioner: { provision: vi.fn(async () => provisioning()) },
    now: () => NOW,
  };
}

function request() {
  return new Request("https://example.test/internal", {
    method: "POST",
    body: JSON.stringify({
      ownerId: "browser-owner",
      email: "attacker@example.com",
    }),
    headers: { cookie: "untrusted=browser" },
  });
}

describe("authenticated billing customer provisioning", () => {
  it("composes verified session, active account, trusted contact, and provisioning", async () => {
    const deps = dependencies();
    const result = await provisionBillingCustomerForRequest(request(), deps);
    expect(result).toEqual({
      version: AUTHENTICATED_BILLING_PROVISIONING_VERSION,
      disposition: "ready",
      code: "customer-ready",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(deps.accountResolver.resolveActiveAccount).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "provider-subject" }),
    );
    expect(deps.contactResolver.resolveTrustedContact).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-id" }),
      OWNER,
    );
    expect(deps.customerProvisioner.provision).toHaveBeenCalledWith({
      ownerId: OWNER,
      contact: { email: "owner@example.com" },
    });
  });

  it.each([
    { status: "unauthenticated" },
    { status: "expired" },
    { status: "revoked" },
    { status: "invalid" },
  ] as SessionVerification[])(
    "short-circuits invalid session %#",
    async (session) => {
      const deps = dependencies(session);
      await expect(
        provisionBillingCustomerForRequest(request(), deps),
      ).resolves.toMatchObject({
        disposition: "authenticate",
        code: "authentication-required",
      });
      expect(deps.accountResolver.resolveActiveAccount).not.toHaveBeenCalled();
      expect(deps.contactResolver.resolveTrustedContact).not.toHaveBeenCalled();
      expect(deps.customerProvisioner.provision).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...activeSession(), subject: "" },
    { ...activeSession(), sessionId: "" },
    { ...activeSession(), expiresAt: NOW },
    { ...activeSession(), authenticatedAt: new Date(NOW.getTime() + 1) },
  ])("rejects malformed active session %#", async (session) => {
    const deps = dependencies(session);
    await expect(
      provisionBillingCustomerForRequest(request(), deps),
    ).resolves.toMatchObject({ disposition: "authenticate" });
    expect(deps.accountResolver.resolveActiveAccount).not.toHaveBeenCalled();
  });

  it("maps verifier outage without exposing it", async () => {
    const deps = dependencies();
    deps.sessionVerifier.verify.mockRejectedValue(
      new Error(`private ${EMAIL}`),
    );
    await expect(
      provisionBillingCustomerForRequest(request(), deps),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "authentication-unavailable",
    });
  });

  it.each([new Error("missing"), "not-a-uuid"])(
    "maps account failure %# and stops",
    async (failure) => {
      const deps = dependencies();
      if (failure instanceof Error)
        deps.accountResolver.resolveActiveAccount.mockRejectedValue(failure);
      else deps.accountResolver.resolveActiveAccount.mockResolvedValue(failure);
      await expect(
        provisionBillingCustomerForRequest(request(), deps),
      ).resolves.toMatchObject({
        disposition: "retry",
        code: "account-unavailable",
      });
      expect(deps.contactResolver.resolveTrustedContact).not.toHaveBeenCalled();
      expect(deps.customerProvisioner.provision).not.toHaveBeenCalled();
    },
  );

  it("distinguishes missing contact from contact-source outage", async () => {
    const missing = dependencies();
    missing.contactResolver.resolveTrustedContact.mockResolvedValue(null);
    await expect(
      provisionBillingCustomerForRequest(request(), missing),
    ).resolves.toMatchObject({
      disposition: "reject",
      code: "billing-contact-unavailable",
    });

    const outage = dependencies();
    outage.contactResolver.resolveTrustedContact.mockRejectedValue(
      new Error(`private ${EMAIL}`),
    );
    await expect(
      provisionBillingCustomerForRequest(request(), outage),
    ).resolves.toMatchObject({
      disposition: "retry",
      code: "contact-source-unavailable",
    });
  });

  it.each([
    { email: "invalid" },
    { email: `owner@${"a".repeat(250)}.com` },
    { email: "owner@example.com", ownerId: OWNER },
    null,
  ])("rejects malformed trusted contact %#", async (contact) => {
    const deps = dependencies();
    deps.contactResolver.resolveTrustedContact.mockResolvedValue(contact);
    await expect(
      provisionBillingCustomerForRequest(request(), deps),
    ).resolves.toMatchObject({
      disposition: "reject",
      code:
        contact === null
          ? "billing-contact-unavailable"
          : "billing-contact-invalid",
    });
    expect(deps.customerProvisioner.provision).not.toHaveBeenCalled();
  });

  it.each([
    ["ready", "ready", "customer-ready"],
    ["reject", "reject", "billing-contact-invalid"],
    ["retry", "retry", "provisioning-unavailable"],
    ["reconcile", "reconcile", "customer-reconciliation-required"],
  ] as const)(
    "maps provisioning %s safely",
    async (source, disposition, code) => {
      const deps = dependencies();
      deps.customerProvisioner.provision.mockResolvedValue(
        provisioning(source),
      );
      await expect(
        provisionBillingCustomerForRequest(request(), deps),
      ).resolves.toMatchObject({ disposition, code });
    },
  );

  it("maps thrown and malformed provisioner results without reflection", async () => {
    const thrown = dependencies();
    thrown.customerProvisioner.provision.mockRejectedValue(
      new Error(`${OWNER} ${EMAIL}`),
    );
    const retry = await provisionBillingCustomerForRequest(request(), thrown);
    expect(retry).toMatchObject({
      disposition: "retry",
      code: "provisioning-unavailable",
    });

    const malformed = dependencies();
    malformed.customerProvisioner.provision.mockResolvedValue({
      disposition: "ready",
      code: "bound",
      ownerId: OWNER,
    });
    const reconcile = await provisionBillingCustomerForRequest(
      request(),
      malformed,
    );
    expect(reconcile).toMatchObject({
      disposition: "reconcile",
      code: "customer-reconciliation-required",
    });
    expect(JSON.stringify([retry, reconcile])).not.toMatch(/10000000|owner@/i);
  });

  it("delegates concurrent requests without consuming browser body ownership", async () => {
    const deps = dependencies();
    await Promise.all([
      provisionBillingCustomerForRequest(request(), deps),
      provisionBillingCustomerForRequest(request(), deps),
    ]);
    expect(deps.customerProvisioner.provision).toHaveBeenCalledTimes(2);
    expect(deps.customerProvisioner.provision).toHaveBeenNthCalledWith(1, {
      ownerId: OWNER,
      contact: { email: "owner@example.com" },
    });
  });
});
