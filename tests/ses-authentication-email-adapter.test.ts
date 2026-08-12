import {
  AccountSuspendedException,
  BadRequestException,
  LimitExceededException,
  MailFromDomainNotVerifiedException,
  MessageRejected,
  NotFoundException,
  SendEmailCommand,
  SendingPausedException,
  TooManyRequestsException,
} from "@aws-sdk/client-sesv2";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AuthenticationEmailConfigurationError,
  AuthenticationEmailDeliveryError,
  type AuthenticationEmailRequest,
} from "@/server/authentication-email";
import {
  createSesAuthenticationEmailDispatcher,
  createSesV2Client,
  loadSesAuthenticationEmailConfiguration,
} from "@/server/ses-authentication-email-adapter";

const ORIGIN = "https://app.example.test";
const configuration = {
  region: "ca-central-1" as const,
  canonicalOrigin: ORIGIN,
  fromEmailAddress: "security@auth.example.test",
  configurationSetName: "authentication-events",
};

function request(): AuthenticationEmailRequest {
  return {
    version: "1.0.0",
    purpose: "verify-email",
    recipient: "person@example.test",
    actionUrl: `${ORIGIN}/api/auth/verify-email?token=header.payload.signature&callbackURL=%2F`,
    templateVersion: "auth.verify-email.en-CA.1",
    idempotencyReference: "A".repeat(43),
  };
}

function fixture(
  options: {
    reserve?: string;
    complete?: string;
    send?: () => Promise<unknown>;
    suppressed?: boolean;
  } = {},
) {
  const reserve = vi.fn(async () => ({
    version: "1.0.0" as const,
    outcome: options.reserve ?? "reserved",
  }));
  const complete = vi.fn(async () => ({
    version: "1.0.0" as const,
    outcome: options.complete ?? "accepted",
  }));
  const send = vi.fn(async (commandValue: SendEmailCommand) => {
    void commandValue;
    return options.send
      ? options.send()
      : ({ MessageId: "ses-message-1" } as const);
  });
  const isSuppressed = vi.fn(async () => options.suppressed ?? false);
  const dispatcher = createSesAuthenticationEmailDispatcher({
    configuration,
    client: { send: send as never },
    idempotency: { reserve: reserve as never, complete: complete as never },
    suppression: { isSuppressed },
  });
  return { dispatcher, reserve, complete, send, isSuppressed };
}

describe("SES authentication-email configuration", () => {
  it("loads only the fixed Canada Central server configuration", () => {
    expect(
      loadSesAuthenticationEmailConfiguration({
        SES_AUTH_EMAIL_REGION: "ca-central-1",
        BETTER_AUTH_BASE_URL: ORIGIN,
        SES_AUTH_EMAIL_FROM: "security@auth.example.test",
        SES_AUTH_EMAIL_CONFIGURATION_SET: "authentication-events",
      }),
    ).toEqual(configuration);
  });

  it("constructs the regional SDK client with automatic retries disabled", async () => {
    const client = createSesV2Client();
    try {
      await expect(client.config.region()).resolves.toBe("ca-central-1");
      await expect(client.config.maxAttempts()).resolves.toBe(1);
    } finally {
      client.destroy();
    }
  });

  it.each([
    {},
    { ...configuration, region: "us-east-1" },
    { ...configuration, canonicalOrigin: "http://app.example.test" },
    { ...configuration, fromEmailAddress: "Security@auth.example.test" },
    { ...configuration, fromEmailAddress: "security@localhost" },
    {
      ...configuration,
      fromEmailAddress: "security..alerts@auth.example.test",
    },
    { ...configuration, configurationSetName: "bad value" },
    { ...configuration, endpoint: "https://email.us-east-1.amazonaws.com" },
  ])("rejects incomplete, nonregional, or augmented configuration", (value) => {
    expect(() =>
      createSesAuthenticationEmailDispatcher({
        configuration: value as never,
        client: { send: vi.fn() },
        idempotency: { reserve: vi.fn(), complete: vi.fn() },
        suppression: { isSuppressed: vi.fn() },
      }),
    ).toThrow(AuthenticationEmailConfigurationError);
  });

  it("rejects browser-exposed SES configuration", () => {
    expect(() =>
      loadSesAuthenticationEmailConfiguration({
        SES_AUTH_EMAIL_REGION: "ca-central-1",
        BETTER_AUTH_BASE_URL: ORIGIN,
        SES_AUTH_EMAIL_FROM: "security@auth.example.test",
        SES_AUTH_EMAIL_CONFIGURATION_SET: "authentication-events",
        NEXT_PUBLIC_SES_AUTH_EMAIL_FROM: "security@auth.example.test",
      }),
    ).toThrow(AuthenticationEmailConfigurationError);
  });
});

describe("SES authentication-email adapter", () => {
  it("sends one exact local text and HTML message and binds acceptance", async () => {
    const delivery = fixture();
    await expect(delivery.dispatcher.dispatch(request())).resolves.toEqual({
      version: "1.0.0",
      disposition: "accepted",
      code: "EMAIL_ACCEPTED",
    });
    expect(delivery.send).toHaveBeenCalledOnce();
    const command = delivery.send.mock.calls[0]![0]!;
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect(command.input).toEqual({
      FromEmailAddress: "security@auth.example.test",
      Destination: { ToAddresses: ["person@example.test"] },
      ConfigurationSetName: "authentication-events",
      Content: {
        Simple: {
          Subject: { Data: "Verify your email address", Charset: "UTF-8" },
          Body: {
            Text: {
              Data: expect.stringContaining(request().actionUrl),
              Charset: "UTF-8",
            },
            Html: {
              Data: expect.stringContaining("Verify email address</a>"),
              Charset: "UTF-8",
            },
          },
        },
      },
    });
    expect(command.input).not.toHaveProperty("EndpointId");
    expect(command.input).not.toHaveProperty("EmailTags");
    expect(command.input).not.toHaveProperty("ReplyToAddresses");
    expect(delivery.complete).toHaveBeenCalledWith(
      request(),
      { version: "1.0.0", disposition: "accepted", code: "EMAIL_ACCEPTED" },
      "ses-message-1",
    );
  });

  it.each([
    ["in-progress", "retry", "EMAIL_RETRY"],
    ["accepted", "accepted", "EMAIL_ACCEPTED"],
    ["rejected", "rejected", "EMAIL_REJECTED"],
    [
      "reconciliation-required",
      "reconciliation-required",
      "EMAIL_RECONCILIATION_REQUIRED",
    ],
    ["suppressed", "suppressed", "EMAIL_SUPPRESSED"],
    ["collision", "rejected", "EMAIL_REJECTED"],
  ])("does not send for stored %s state", async (stored, disposition, code) => {
    const delivery = fixture({ reserve: stored });
    await expect(delivery.dispatcher.dispatch(request())).resolves.toEqual({
      version: "1.0.0",
      disposition,
      code,
    });
    expect(delivery.send).not.toHaveBeenCalled();
    expect(delivery.isSuppressed).not.toHaveBeenCalled();
  });

  it("records local suppression before provider work", async () => {
    const delivery = fixture({ suppressed: true, complete: "suppressed" });
    await expect(
      delivery.dispatcher.dispatch(request()),
    ).resolves.toMatchObject({
      disposition: "suppressed",
    });
    expect(delivery.send).not.toHaveBeenCalled();
    expect(delivery.complete).toHaveBeenCalledWith(
      request(),
      {
        version: "1.0.0",
        disposition: "suppressed",
        code: "EMAIL_SUPPRESSED",
      },
      undefined,
    );
  });

  it.each([TooManyRequestsException, LimitExceededException])(
    "records definite %s quota rejection as retry without a second send",
    async (ErrorType) => {
      const delivery = fixture({
        complete: "retry",
        send: async () => {
          throw new ErrorType({
            $metadata: {},
            message: "private provider detail",
          });
        },
      });
      await expect(delivery.dispatcher.dispatch(request())).resolves.toEqual({
        version: "1.0.0",
        disposition: "retry",
        code: "EMAIL_RETRY",
      });
      expect(delivery.send).toHaveBeenCalledOnce();
    },
  );

  it.each([
    MessageRejected,
    MailFromDomainNotVerifiedException,
    AccountSuspendedException,
    SendingPausedException,
    BadRequestException,
    NotFoundException,
  ])(
    "records definite %s rejection without reflecting provider detail",
    async (ErrorType) => {
      const delivery = fixture({
        complete: "rejected",
        send: async () => {
          throw new ErrorType({
            $metadata: {},
            message: "person@example.test token provider detail",
          });
        },
      });
      const result = await delivery.dispatcher.dispatch(request());
      expect(result).toEqual({
        version: "1.0.0",
        disposition: "rejected",
        code: "EMAIL_REJECTED",
      });
      expect(JSON.stringify(result)).not.toMatch(
        /person|token|provider detail/i,
      );
    },
  );

  it.each([
    async () => {
      throw new Error("network timeout private data");
    },
    async () => ({}),
    async () => ({ MessageId: "bad message id" }),
  ])(
    "records ambiguous send or malformed success as reconciliation",
    async (send) => {
      const delivery = fixture({ send, complete: "reconciliation-required" });
      await expect(delivery.dispatcher.dispatch(request())).resolves.toEqual({
        version: "1.0.0",
        disposition: "reconciliation-required",
        code: "EMAIL_RECONCILIATION_REQUIRED",
      });
      expect(delivery.send).toHaveBeenCalledOnce();
    },
  );

  it("records suppression lookup failure as reconciliation without sending", async () => {
    const delivery = fixture({ complete: "reconciliation-required" });
    delivery.isSuppressed.mockRejectedValueOnce(
      new Error("person@example.test suppression backend detail"),
    );
    await expect(
      delivery.dispatcher.dispatch(request()),
    ).resolves.toMatchObject({
      disposition: "reconciliation-required",
    });
    expect(delivery.send).not.toHaveBeenCalled();
  });

  it("sanitizes malformed repository output and persistence failure", async () => {
    const malformed = fixture({ reserve: "unknown" });
    await expect(malformed.dispatcher.dispatch(request())).rejects.toEqual(
      new AuthenticationEmailDeliveryError(),
    );

    const failed = fixture();
    failed.reserve.mockRejectedValueOnce(
      new Error("person@example.test database detail"),
    );
    await expect(failed.dispatcher.dispatch(request())).rejects.toEqual(
      new AuthenticationEmailDeliveryError(),
    );
  });
});
