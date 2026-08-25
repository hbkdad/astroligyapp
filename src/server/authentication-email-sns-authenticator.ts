import { KeyObject, verify, X509Certificate } from "node:crypto";

import type {
  AuthenticationEmailFeedbackAuthenticator,
  AuthenticationEmailSnsVerificationInput,
} from "./authentication-email-feedback";

export type TrustedSnsSigningCertificate = Readonly<{
  version: "1.0.0";
  publicKey: KeyObject;
  chainVerified: true;
  dnsNames: readonly string[];
  validFrom: Date;
  validTo: Date;
}>;

export interface AuthenticationEmailSnsCertificateAuthority {
  loadTrustedCertificate(url: string): Promise<TrustedSnsSigningCertificate>;
}

type CertificateFetch = (
  input: string,
  init: Readonly<{
    redirect: "error";
    signal: AbortSignal;
  }>,
) => Promise<
  Readonly<{
    ok: boolean;
    url: string;
    headers: Readonly<{ get(name: string): string | null }>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>
>;

export function createHttpsAuthenticationEmailSnsCertificateAuthority(
  input: {
    readonly fetch?: CertificateFetch;
    readonly clock?: () => Date;
    readonly timeoutMilliseconds?: number;
    readonly cacheMilliseconds?: number;
  } = {},
): AuthenticationEmailSnsCertificateAuthority {
  if (!record(input)) invalid();
  const fetchCertificate = input.fetch ?? globalThis.fetch;
  const clock = input.clock ?? (() => new Date());
  const timeoutMilliseconds = input.timeoutMilliseconds ?? 5_000;
  const cacheMilliseconds = input.cacheMilliseconds ?? 3_600_000;
  if (
    typeof fetchCertificate !== "function" ||
    !Number.isSafeInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 100 ||
    timeoutMilliseconds > 10_000 ||
    !Number.isSafeInteger(cacheMilliseconds) ||
    cacheMilliseconds < 60_000 ||
    cacheMilliseconds > 86_400_000
  )
    invalid();
  validDate(clock());
  const cache = new Map<
    string,
    Readonly<{
      certificate: TrustedSnsSigningCertificate;
      expiresAt: number;
    }>
  >();

  return Object.freeze({
    async loadTrustedCertificate(urlValue: string) {
      const url = trustedCertificateUrl(urlValue);
      const now = validDate(clock());
      const cached = cache.get(url);
      if (cached && cached.expiresAt > now.getTime()) return cached.certificate;
      const response = await fetchCertificate(url, {
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
      const length = response.headers.get("content-length");
      if (
        !response.ok ||
        response.url !== url ||
        (length !== null &&
          (!/^\d{1,6}$/.test(length) || Number(length) > 32 * 1024))
      )
        invalid();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 32 * 1024) invalid();
      const pem = bytes.toString("ascii");
      if (
        !/^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/]{1,76}\r?\n)+-----END CERTIFICATE-----\r?\n?$/.test(
          pem,
        )
      )
        invalid();
      const x509 = new X509Certificate(pem);
      const validFrom = new Date(x509.validFrom);
      const validTo = new Date(x509.validTo);
      const dnsName = x509.checkHost("sns.amazonaws.com");
      if (
        dnsName !== "sns.amazonaws.com" ||
        !["rsa", "rsa-pss"].includes(x509.publicKey.asymmetricKeyType ?? "") ||
        (x509.publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
        now < validDate(validFrom) ||
        now > validDate(validTo)
      )
        invalid();
      const certificate = Object.freeze({
        version: "1.0.0" as const,
        publicKey: x509.publicKey,
        // The fixed AWS URL is fetched over Node's validated HTTPS trust chain
        // with redirects disabled; the returned signer is additionally bound to
        // the exact SNS certificate identity before its public key is accepted.
        chainVerified: true as const,
        dnsNames: Object.freeze(["sns.amazonaws.com"]),
        validFrom,
        validTo,
      });
      if (cache.size >= 8) cache.delete(cache.keys().next().value!);
      cache.set(
        url,
        Object.freeze({
          certificate,
          expiresAt: Math.min(
            validTo.getTime(),
            now.getTime() + cacheMilliseconds,
          ),
        }),
      );
      return certificate;
    },
  });
}

export function createAuthenticationEmailSnsAuthenticator(input: {
  readonly certificateAuthority: AuthenticationEmailSnsCertificateAuthority;
  readonly clock?: () => Date;
  readonly allowedFutureSkewSeconds?: number;
}): AuthenticationEmailFeedbackAuthenticator {
  if (
    !record(input) ||
    !record(input.certificateAuthority) ||
    typeof input.certificateAuthority.loadTrustedCertificate !== "function"
  )
    invalid();
  const clock = input.clock ?? (() => new Date());
  const allowedFutureSkewSeconds = input.allowedFutureSkewSeconds ?? 300;
  if (
    !Number.isSafeInteger(allowedFutureSkewSeconds) ||
    allowedFutureSkewSeconds < 0 ||
    allowedFutureSkewSeconds > 900
  )
    invalid();
  validDate(clock());

  return Object.freeze({
    async verify(value: AuthenticationEmailSnsVerificationInput) {
      let message: ReturnType<typeof validateInput>;
      try {
        message = validateInput(value);
        const now = validDate(clock());
        if (
          message.timestamp.getTime() >
          now.getTime() + allowedFutureSkewSeconds * 1_000
        )
          return false;
      } catch {
        return false;
      }
      const loaded = await input.certificateAuthority.loadTrustedCertificate(
        message.signingCertificateUrl,
      );
      try {
        const certificate = validateCertificate(loaded, validDate(clock()));
        const signature = Buffer.from(message.signature, "base64");
        if (signature.length < 128 || signature.length > 1024) return false;
        return verify(
          "RSA-SHA256",
          Buffer.from(canonicalNotification(message), "utf8"),
          certificate.publicKey,
          signature,
        );
      } catch {
        return false;
      }
    },
  });
}

function canonicalNotification(value: ReturnType<typeof validateInput>) {
  const fields: readonly (readonly [string, string])[] = [
    ["Message", value.message],
    ["MessageId", value.messageId],
    ...(value.subject === undefined
      ? []
      : ([["Subject", value.subject]] as const)),
    ["Timestamp", value.timestampText],
    ["TopicArn", value.topicArn],
    ["Type", "Notification"],
  ];
  return fields.map(([name, field]) => `${name}\n${field}`).join("\n");
}

function validateInput(value: AuthenticationEmailSnsVerificationInput) {
  if (
    !record(value) ||
    value.version !== "1.0.0" ||
    value.signatureVersion !== "2" ||
    typeof value.messageId !== "string" ||
    typeof value.topicArn !== "string" ||
    typeof value.timestamp !== "string" ||
    typeof value.signature !== "string" ||
    typeof value.signingCertificateUrl !== "string" ||
    typeof value.message !== "string" ||
    (value.subject !== undefined && typeof value.subject !== "string")
  )
    invalid();
  const timestamp = new Date(value.timestamp);
  if (
    !Number.isFinite(timestamp.getTime()) ||
    timestamp.toISOString() !== value.timestamp
  )
    invalid();
  return Object.freeze({
    messageId: value.messageId,
    topicArn: value.topicArn,
    timestamp,
    timestampText: value.timestamp,
    signature: value.signature,
    signingCertificateUrl: value.signingCertificateUrl,
    message: value.message,
    ...(value.subject === undefined ? {} : { subject: value.subject }),
  });
}

function validateCertificate(
  value: TrustedSnsSigningCertificate,
  now: Date,
): TrustedSnsSigningCertificate {
  if (
    !record(value) ||
    value.version !== "1.0.0" ||
    value.chainVerified !== true ||
    !(value.publicKey instanceof KeyObject) ||
    value.publicKey.type !== "public" ||
    !["rsa", "rsa-pss"].includes(value.publicKey.asymmetricKeyType ?? "") ||
    (value.publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
    !Array.isArray(value.dnsNames) ||
    !value.dnsNames.includes("sns.amazonaws.com") ||
    !(value.validFrom instanceof Date) ||
    !(value.validTo instanceof Date)
  )
    invalid();
  const validFrom = validDate(value.validFrom);
  const validTo = validDate(value.validTo);
  if (now < validFrom || now > validTo || validFrom >= validTo) invalid();
  return value;
}

function trustedCertificateUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "sns.ca-central-1.amazonaws.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !/^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(url.pathname)
  )
    invalid();
  return url.toString();
}

function validDate(value: Date) {
  if (!Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new TypeError("Invalid SNS authentication input");
}
