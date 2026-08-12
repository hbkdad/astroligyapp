import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AUTHENTICATION_EMAIL_REQUEST_VERSION,
  AUTHENTICATION_EMAIL_RESULT_VERSION,
  AUTHENTICATION_EMAIL_TEMPLATE_VERSIONS,
  AuthenticationEmailConfigurationError,
  AuthenticationEmailDeliveryError,
  AuthenticationEmailRequestError,
  createBetterAuthEmailCallbacks,
  renderAuthenticationEmail,
  validateAuthenticationEmailRequest,
  validateAuthenticationEmailResult,
  type AuthenticationEmailDispatcher,
  type AuthenticationEmailRequest,
} from "@/server/authentication-email";

const ORIGIN = "https://app.example.test";
const REFERENCE = "A".repeat(43);
const VERIFY_TOKEN = "header.payload.signature_1";
const VERIFY_URL = `${ORIGIN}/api/auth/verify-email?token=${VERIFY_TOKEN}&callbackURL=%2F`;
const RESET_URL = `${ORIGIN}/api/auth/reset-password/AbCdEfGhIjKlMnOpQrStUvWx?callbackURL=%2Faccount`;

function request(
  overrides: Partial<AuthenticationEmailRequest> = {},
): AuthenticationEmailRequest {
  return {
    version: AUTHENTICATION_EMAIL_REQUEST_VERSION,
    purpose: "verify-email",
    recipient: "person@example.test",
    actionUrl: VERIFY_URL,
    templateVersion: AUTHENTICATION_EMAIL_TEMPLATE_VERSIONS["verify-email"],
    idempotencyReference: REFERENCE,
    ...overrides,
  };
}

describe("authentication email contract", () => {
  it("validates and freezes the exact provider-neutral request", () => {
    const validated = validateAuthenticationEmailRequest(request(), ORIGIN);

    expect(validated).toEqual(request());
    expect(Object.isFrozen(validated)).toBe(true);
  });

  it("accepts only matching fixed safe result pairs", () => {
    for (const result of [
      { disposition: "accepted", code: "EMAIL_ACCEPTED" },
      { disposition: "rejected", code: "EMAIL_REJECTED" },
      { disposition: "retry", code: "EMAIL_RETRY" },
      {
        disposition: "reconciliation-required",
        code: "EMAIL_RECONCILIATION_REQUIRED",
      },
      { disposition: "suppressed", code: "EMAIL_SUPPRESSED" },
    ] as const) {
      expect(
        validateAuthenticationEmailResult({
          version: AUTHENTICATION_EMAIL_RESULT_VERSION,
          ...result,
        }),
      ).toEqual({
        version: AUTHENTICATION_EMAIL_RESULT_VERSION,
        ...result,
      });
    }

    expect(() =>
      validateAuthenticationEmailResult({
        version: AUTHENTICATION_EMAIL_RESULT_VERSION,
        disposition: "accepted",
        code: "EMAIL_RETRY",
      }),
    ).toThrow(AuthenticationEmailDeliveryError);
    expect(() =>
      validateAuthenticationEmailResult({
        version: AUTHENTICATION_EMAIL_RESULT_VERSION,
        disposition: "accepted",
        code: "EMAIL_ACCEPTED",
        providerMessageId: "must-not-cross",
      }),
    ).toThrow(AuthenticationEmailDeliveryError);
  });

  it.each([
    request({ recipient: "Person@example.test" }),
    request({ recipient: " person@example.test" }),
    request({ recipient: "person@localhost" }),
    request({ recipient: "person..value@example.test" }),
    request({ recipient: "person@-example.test" }),
    request({ recipient: "pérson@example.test" }),
    request({ idempotencyReference: "short" }),
    request({ idempotencyReference: "!".repeat(43) }),
    request({ idempotencyReference: `${"A".repeat(42)}B` }),
    request({ templateVersion: "auth.reset-password.en-CA.1" }),
    request({ actionUrl: VERIFY_URL.replace("https:", "http:") }),
    request({ actionUrl: VERIFY_URL.replace(ORIGIN, "https://other.test") }),
    request({ actionUrl: `${VERIFY_URL}&debug=true` }),
    request({ actionUrl: `${VERIFY_URL}#fragment` }),
    request({ actionUrl: `${ORIGIN}/api/auth/verify-email?callbackURL=%2F` }),
    request({ actionUrl: `${VERIFY_URL}&token=duplicate` }),
    request({
      actionUrl: `${ORIGIN}/api/auth/verify-email?token=${VERIFY_TOKEN}&callbackURL=https%3A%2F%2Fevil.test`,
    }),
    request({
      actionUrl: `${ORIGIN}/api/auth/verify-email?token=${VERIFY_TOKEN}&callbackURL=%2F%2Fevil.test`,
    }),
    request({
      actionUrl: `${ORIGIN}/api/auth/verify-email?token=${VERIFY_TOKEN}&callbackURL=%2F%0Aheader`,
    }),
    request({
      purpose: "reset-password",
      actionUrl: RESET_URL,
      templateVersion: "auth.verify-email.en-CA.1",
    }),
    { ...request(), accountId: "browser-owned" },
    { ...request(), subject: "user-controlled" },
  ])("rejects malformed, mismatched, or augmented request input", (value) => {
    expect(() => validateAuthenticationEmailRequest(value, ORIGIN)).toThrow(
      AuthenticationEmailRequestError,
    );
  });

  it.each([
    "http://app.example.test",
    "https://app.example.test/",
    "https://user@app.example.test",
    "https://app.example.test/path",
    "https://app.example.test?debug=true",
  ])("rejects a noncanonical delivery origin", (origin) => {
    expect(() => validateAuthenticationEmailRequest(request(), origin)).toThrow(
      AuthenticationEmailConfigurationError,
    );
  });
});

describe("local authentication email templates", () => {
  it("renders deterministic generic verification text and escaped HTML", () => {
    const rendered = renderAuthenticationEmail(request(), ORIGIN);

    expect(rendered).toEqual({
      version: "1.0.0",
      purpose: "verify-email",
      templateVersion: "auth.verify-email.en-CA.1",
      subject: "Verify your email address",
      text: `Verify your email address by opening this secure link:\n\n${VERIFY_URL}\n\nThis link expires in one hour. If you did not request this, you can ignore this message.`,
      html: `<!doctype html><html lang="en-CA"><body><p>Verify your email address by opening this secure link:</p><p><a href="${VERIFY_URL.replaceAll("&", "&amp;")}">Verify email address</a></p><p>This link expires in one hour. If you did not request this, you can ignore this message.</p></body></html>`,
    });
    expect(Object.isFrozen(rendered)).toBe(true);
    expect(rendered.html).not.toContain(`?token=${VERIFY_TOKEN}&callbackURL`);
    expect(JSON.stringify(rendered)).not.toContain("person@example.test");
    expect(JSON.stringify(rendered)).not.toContain(REFERENCE);
  });

  it("renders the separate reset template without interpretation or identity", () => {
    const rendered = renderAuthenticationEmail(
      request({
        purpose: "reset-password",
        actionUrl: RESET_URL,
        templateVersion: "auth.reset-password.en-CA.1",
      }),
      ORIGIN,
    );

    expect(rendered.subject).toBe("Reset your password");
    expect(rendered.text).toContain(RESET_URL);
    expect(rendered.html).toContain(">Reset password</a>");
    expect(JSON.stringify(rendered)).not.toMatch(/person|profile|account id/i);
  });
});

describe("Better Auth authentication-email seam", () => {
  function dependencies(
    result: unknown = {
      version: AUTHENTICATION_EMAIL_RESULT_VERSION,
      disposition: "accepted",
      code: "EMAIL_ACCEPTED",
    },
  ) {
    const dispatch = vi.fn(async (requestValue: AuthenticationEmailRequest) => {
      void requestValue;
      return result;
    });
    const create = vi.fn(() => REFERENCE);
    return {
      dispatch,
      create,
      callbacks: createBetterAuthEmailCallbacks({
        canonicalOrigin: ORIGIN,
        dispatcher: {
          dispatch:
            dispatch as unknown as AuthenticationEmailDispatcher["dispatch"],
        },
        idempotencyReferences: { create },
      }),
    };
  }

  it("maps each callback into an exact request without crossing the raw token", async () => {
    const delivery = dependencies();
    await delivery.callbacks.sendVerification({
      recipient: "person@example.test",
      actionUrl: VERIFY_URL,
      token: "raw-verification-token",
    });
    await delivery.callbacks.sendPasswordReset({
      recipient: "person@example.test",
      actionUrl: RESET_URL,
      token: "raw-reset-token",
    });

    expect(delivery.create).toHaveBeenNthCalledWith(1, {
      purpose: "verify-email",
      token: "raw-verification-token",
    });
    expect(delivery.dispatch).toHaveBeenNthCalledWith(1, request());
    expect(Object.isFrozen(delivery.dispatch.mock.calls[0]?.[0])).toBe(true);
    expect(delivery.dispatch).toHaveBeenNthCalledWith(
      2,
      request({
        purpose: "reset-password",
        actionUrl: RESET_URL,
        templateVersion: "auth.reset-password.en-CA.1",
      }),
    );
    expect(JSON.stringify(delivery.dispatch.mock.calls)).not.toContain(
      "raw-verification-token",
    );
    expect(JSON.stringify(delivery.dispatch.mock.calls)).not.toContain(
      "raw-reset-token",
    );
  });

  it.each([
    {
      version: AUTHENTICATION_EMAIL_RESULT_VERSION,
      disposition: "retry",
      code: "EMAIL_RETRY",
    },
    {
      version: AUTHENTICATION_EMAIL_RESULT_VERSION,
      disposition: "suppressed",
      code: "EMAIL_SUPPRESSED",
    },
    {
      version: AUTHENTICATION_EMAIL_RESULT_VERSION,
      disposition: "accepted",
      code: "EMAIL_ACCEPTED",
      recipient: "leaked@example.test",
    },
  ])(
    "fails every nonaccepted or malformed result with one generic error",
    async (result) => {
      const delivery = dependencies(result);
      await expect(
        delivery.callbacks.sendVerification({
          recipient: "person@example.test",
          actionUrl: VERIFY_URL,
          token: "secret-token",
        }),
      ).rejects.toEqual(new AuthenticationEmailDeliveryError());
    },
  );

  it("sanitizes dispatcher and reference-factory exceptions", async () => {
    const dispatcher = createBetterAuthEmailCallbacks({
      canonicalOrigin: ORIGIN,
      dispatcher: {
        dispatch: async () => {
          throw new Error("person@example.test secret-token provider-payload");
        },
      },
      idempotencyReferences: { create: () => REFERENCE },
    });
    await expect(
      dispatcher.sendVerification({
        recipient: "person@example.test",
        actionUrl: VERIFY_URL,
        token: "secret-token",
      }),
    ).rejects.toThrow("Authentication email delivery is unavailable");

    const referenceFailure = createBetterAuthEmailCallbacks({
      canonicalOrigin: ORIGIN,
      dispatcher: {
        dispatch: async () => ({
          version: AUTHENTICATION_EMAIL_RESULT_VERSION,
          disposition: "accepted",
          code: "EMAIL_ACCEPTED",
        }),
      },
      idempotencyReferences: {
        create: () => {
          throw new Error("secret-token");
        },
      },
    });
    await expect(
      referenceFailure.sendVerification({
        recipient: "person@example.test",
        actionUrl: VERIFY_URL,
        token: "secret-token",
      }),
    ).rejects.toEqual(new AuthenticationEmailDeliveryError());
  });
});
