import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createAuthenticationEmailSnsAuthenticator,
  createHttpsAuthenticationEmailSnsCertificateAuthority,
} from "@/server/authentication-email-sns-authenticator";
import type { AuthenticationEmailSnsVerificationInput } from "@/server/authentication-email-feedback";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });

type VerificationOverrides = Omit<
  Partial<AuthenticationEmailSnsVerificationInput>,
  "subject"
> & { subject?: string | undefined };

function unsigned(overrides: VerificationOverrides = {}) {
  const value: Record<string, unknown> = {
    version: "1.0.0",
    messageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    topicArn: "arn:aws:sns:ca-central-1:123456789012:authentication-feedback",
    timestamp: "2026-08-24T11:59:00.000Z",
    signatureVersion: "2",
    signature: "pending",
    signingCertificateUrl:
      "https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-test.pem",
    message: '{"eventType":"Delivery"}',
    subject: "Authentication feedback",
    ...overrides,
  };
  if (Object.hasOwn(overrides, "subject") && overrides.subject === undefined)
    delete value.subject;
  return value as AuthenticationEmailSnsVerificationInput;
}

function canonical(value: AuthenticationEmailSnsVerificationInput) {
  return [
    ["Message", value.message],
    ["MessageId", value.messageId],
    ...(value.subject === undefined ? [] : [["Subject", value.subject]]),
    ["Timestamp", value.timestamp],
    ["TopicArn", value.topicArn],
    ["Type", "Notification"],
  ]
    .map(([name, field]) => `${name}\n${field}`)
    .join("\n");
}

function signed(overrides: VerificationOverrides = {}) {
  const value = unsigned(overrides);
  return {
    ...value,
    signature: sign(
      "RSA-SHA256",
      Buffer.from(canonical(value), "utf8"),
      keys.privateKey,
    ).toString("base64"),
  };
}

function authority(overrides: Record<string, unknown> = {}) {
  return {
    loadTrustedCertificate: vi.fn(async () => ({
      version: "1.0.0",
      publicKey: keys.publicKey,
      chainVerified: true,
      dnsNames: ["sns.amazonaws.com"],
      validFrom: new Date("2026-08-23T00:00:00.000Z"),
      validTo: new Date("2026-08-25T00:00:00.000Z"),
      ...overrides,
    })),
  };
}

describe("SNS authentication email feedback signatures", () => {
  it.each([signed(), signed({ subject: undefined })])(
    "verifies canonical SHA-256 notifications with or without a subject",
    async (message) => {
      const certificateAuthority = authority();
      const authenticator = createAuthenticationEmailSnsAuthenticator({
        certificateAuthority: certificateAuthority as never,
        clock: () => NOW,
      });
      await expect(authenticator.verify(message)).resolves.toBe(true);
      expect(certificateAuthority.loadTrustedCertificate).toHaveBeenCalledWith(
        message.signingCertificateUrl,
      );
    },
  );

  it.each([
    { message: { ...signed(), message: "tampered" }, certificate: {} },
    {
      message: signed({ signatureVersion: "1" }),
      certificate: {},
    },
    {
      message: signed({ timestamp: "2026-08-24T12:05:01.000Z" }),
      certificate: {},
    },
    { message: signed(), certificate: { chainVerified: false } },
    { message: signed(), certificate: { dnsNames: ["attacker.example"] } },
    {
      message: signed(),
      certificate: { validTo: new Date("2026-08-24T11:59:59.000Z") },
    },
  ])(
    "rejects tampering, legacy signatures, future events, and untrusted certificates",
    async ({ message, certificate }) => {
      const authenticator = createAuthenticationEmailSnsAuthenticator({
        certificateAuthority: authority(certificate) as never,
        clock: () => NOW,
      });
      await expect(authenticator.verify(message)).resolves.toBe(false);
    },
  );

  it("propagates certificate-authority outages for queue retry", async () => {
    const authenticator = createAuthenticationEmailSnsAuthenticator({
      certificateAuthority: {
        async loadTrustedCertificate() {
          throw new Error("private certificate endpoint failure");
        },
      },
      clock: () => NOW,
    });
    await expect(authenticator.verify(signed())).rejects.toThrow(
      "private certificate endpoint failure",
    );
  });

  it("confines certificate retrieval to one fixed AWS origin without redirects", async () => {
    const fetchCertificate = vi.fn<
      (
        url: string,
        init: { redirect: "error"; signal: AbortSignal },
      ) => Promise<{
        ok: boolean;
        url: string;
        headers: { get: () => string };
        arrayBuffer: () => Promise<ArrayBuffer>;
      }>
    >(async () => ({
      ok: true,
      url: "https://attacker.example/certificate.pem",
      headers: { get: () => "100" },
      arrayBuffer: async () => new ArrayBuffer(100),
    }));
    const certificateAuthority =
      createHttpsAuthenticationEmailSnsCertificateAuthority({
        fetch: fetchCertificate,
        clock: () => NOW,
      });
    await expect(
      certificateAuthority.loadTrustedCertificate(
        "https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-test.pem",
      ),
    ).rejects.toThrow("Invalid SNS authentication input");
    expect(fetchCertificate.mock.calls[0]![1]).toMatchObject({
      redirect: "error",
    });
    await expect(
      certificateAuthority.loadTrustedCertificate(
        "https://sns.ca-central-1.amazonaws.com.attacker.test/SimpleNotificationService-test.pem",
      ),
    ).rejects.toThrow("Invalid SNS authentication input");
    expect(fetchCertificate).toHaveBeenCalledOnce();
  });

  it("rejects oversized certificates before buffering their body", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const certificateAuthority =
      createHttpsAuthenticationEmailSnsCertificateAuthority({
        fetch: vi.fn(async (url) => ({
          ok: true,
          url,
          headers: { get: () => String(32 * 1024 + 1) },
          arrayBuffer,
        })),
        clock: () => NOW,
      });
    await expect(
      certificateAuthority.loadTrustedCertificate(
        "https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-test.pem",
      ),
    ).rejects.toThrow("Invalid SNS authentication input");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
