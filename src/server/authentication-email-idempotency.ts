import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import {
  AuthenticationEmailConfigurationError,
  type AuthenticationEmailIdempotencyReferenceFactory,
  type AuthenticationEmailPurpose,
  type AuthenticationEmailRequest,
  type AuthenticationEmailResult,
  validateAuthenticationEmailRequest,
  validateAuthenticationEmailResult,
} from "@/server/authentication-email";

const REFERENCE_DOMAIN = "authentication-email-reference-v1";
const REQUEST_DOMAIN = "authentication-email-request-v1";
const DEFAULT_LEASE_MILLISECONDS = 5 * 60 * 1000;

export interface AuthenticationEmailIdempotencyKey {
  readonly version: number;
  readonly value: string;
}

export interface AuthenticationEmailIdempotencyConfiguration {
  readonly keys: readonly AuthenticationEmailIdempotencyKey[];
  readonly leaseMilliseconds: number;
}

export type AuthenticationEmailReservation = Readonly<{
  version: "1.0.0";
  outcome:
    | "reserved"
    | "in-progress"
    | "accepted"
    | "rejected"
    | "retry"
    | "reconciliation-required"
    | "suppressed"
    | "collision";
}>;

interface DeliveryRow {
  reference_key_version: number;
  reference_digest: string;
  request_digest: string;
  state: string;
  lease_expires_at: Date | string;
}

interface ValidatedKey {
  readonly version: number;
  readonly bytes: Buffer;
}

export class AuthenticationEmailIdempotencyRepository {
  private readonly keys: readonly ValidatedKey[];
  private readonly leaseMilliseconds: number;

  constructor(
    private readonly pool: Pick<Pool, "connect">,
    configurationValue: AuthenticationEmailIdempotencyConfiguration,
    private readonly canonicalOrigin: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    const configuration = validateConfiguration(configurationValue);
    this.keys = configuration.keys;
    this.leaseMilliseconds = configuration.leaseMilliseconds;
    validateCanonicalOrigin(canonicalOrigin);
    validInstant(clock());
  }

  async reserve(value: unknown): Promise<AuthenticationEmailReservation> {
    const request = validateAuthenticationEmailRequest(
      value,
      this.canonicalOrigin,
    );
    const now = validInstant(this.clock());
    return this.transaction(async (client) => {
      const digests = this.keys.map((key) => referenceDigest(request, key));
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [digests[0]],
      );
      const selected = await client.query<DeliveryRow>(
        `select reference_key_version, reference_digest, request_digest,
                state, lease_expires_at
         from authentication_email_delivery
         where reference_digest = any($1::text[])
         for update`,
        [digests],
      );
      const row = selected.rows[0];
      if (row) {
        const key = this.keys.find(
          (candidate) => candidate.version === row.reference_key_version,
        );
        if (
          !key ||
          !equalDigest(row.request_digest, requestDigest(request, key))
        )
          return reservation("collision");
        if (
          row.state === "reserved" &&
          instant(row.lease_expires_at).getTime() <= now.getTime()
        ) {
          await client.query(
            `update authentication_email_delivery
             set state = 'reconciliation-required', completed_at = $2,
                 updated_at = $2
             where reference_digest = $1 and state = 'reserved'`,
            [row.reference_digest, now],
          );
          return reservation("reconciliation-required");
        }
        return reservation(
          row.state === "reserved" ? "in-progress" : stateOutcome(row.state),
        );
      }

      const key = this.keys[0]!;
      await client.query(
        `insert into authentication_email_delivery
           (purpose, template_version, reference_key_version,
            reference_digest, request_digest, state, reserved_at,
            lease_expires_at, updated_at)
         values ($1, $2, $3, $4, $5, 'reserved', $6, $7, $6)`,
        [
          request.purpose,
          request.templateVersion,
          key.version,
          referenceDigest(request, key),
          requestDigest(request, key),
          now,
          new Date(now.getTime() + this.leaseMilliseconds),
        ],
      );
      return reservation("reserved");
    });
  }

  async complete(
    requestValue: unknown,
    resultValue: unknown,
    providerMessageReference?: unknown,
  ): Promise<AuthenticationEmailReservation> {
    const request = validateAuthenticationEmailRequest(
      requestValue,
      this.canonicalOrigin,
    );
    const result = validateAuthenticationEmailResult(resultValue);
    const providerReference = validateProviderReference(
      result,
      providerMessageReference,
    );
    const now = validInstant(this.clock());
    return this.transaction(async (client) => {
      const digests = this.keys.map((key) => referenceDigest(request, key));
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [digests[0]],
      );
      const selected = await client.query<DeliveryRow>(
        `select reference_key_version, reference_digest, request_digest,
                state, lease_expires_at
         from authentication_email_delivery
         where reference_digest = any($1::text[])
         for update`,
        [digests],
      );
      const row = selected.rows[0];
      if (!row) return reservation("reconciliation-required");
      const key = this.keys.find(
        (candidate) => candidate.version === row.reference_key_version,
      );
      if (!key || !equalDigest(row.request_digest, requestDigest(request, key)))
        return reservation("collision");
      if (row.state !== "reserved") return reservation(stateOutcome(row.state));
      if (instant(row.lease_expires_at).getTime() <= now.getTime()) {
        await client.query(
          `update authentication_email_delivery
           set state = 'reconciliation-required', completed_at = $2,
               updated_at = $2
           where reference_digest = $1 and state = 'reserved'`,
          [row.reference_digest, now],
        );
        return reservation("reconciliation-required");
      }
      await client.query(
        `update authentication_email_delivery
         set state = $2, provider_message_reference = $3,
             completed_at = $4, updated_at = $4
         where reference_digest = $1 and state = 'reserved'`,
        [row.reference_digest, result.disposition, providerReference, now],
      );
      return reservation(result.disposition);
    });
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role app_auth_email_runtime");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original failure and discard the pooled connection below.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export function loadAuthenticationEmailIdempotencyConfiguration(
  environment: NodeJS.ProcessEnv | Record<string, unknown>,
): Readonly<AuthenticationEmailIdempotencyConfiguration> {
  if (!record(environment)) configurationInvalid();
  if (
    Object.entries(environment).some(
      ([name, value]) =>
        name.startsWith("NEXT_PUBLIC_AUTH_EMAIL_IDEMPOTENCY") &&
        typeof value === "string" &&
        value.length > 0,
    )
  )
    configurationInvalid();
  const raw = environment.AUTH_EMAIL_IDEMPOTENCY_KEYS;
  const lease = environment.AUTH_EMAIL_IDEMPOTENCY_LEASE_SECONDS;
  if (typeof raw !== "string" || raw.length === 0) configurationInvalid();
  const keys = raw.split(",").map((entry) => {
    const separator = entry.indexOf(":");
    if (separator <= 0 || separator === entry.length - 1)
      configurationInvalid();
    return {
      version: Number(entry.slice(0, separator)),
      value: entry.slice(separator + 1),
    };
  });
  const leaseMilliseconds =
    lease === undefined ? DEFAULT_LEASE_MILLISECONDS : Number(lease) * 1000;
  const validated = validateConfiguration({ keys, leaseMilliseconds });
  return Object.freeze({
    keys: Object.freeze(
      validated.keys.map((key) =>
        Object.freeze({
          version: key.version,
          value: key.bytes.toString("base64url"),
        }),
      ),
    ),
    leaseMilliseconds: validated.leaseMilliseconds,
  });
}

export function createAuthenticationEmailIdempotencyReferenceFactory(
  configurationValue: AuthenticationEmailIdempotencyConfiguration,
): AuthenticationEmailIdempotencyReferenceFactory {
  const key = validateConfiguration(configurationValue).keys[0]!;
  return Object.freeze({
    create(
      input: Readonly<{ purpose: AuthenticationEmailPurpose; token: string }>,
    ) {
      if (
        !record(input) ||
        Object.keys(input).length !== 2 ||
        !isPurpose(input.purpose) ||
        typeof input.token !== "string" ||
        input.token.length < 1 ||
        input.token.length > 4096 ||
        /[\u0000-\u001f\u007f]/.test(input.token)
      )
        configurationInvalid();
      return hmac(key, REFERENCE_DOMAIN, [input.purpose, input.token]).toString(
        "base64url",
      );
    },
  });
}

function validateConfiguration(
  value: AuthenticationEmailIdempotencyConfiguration,
): Readonly<{ keys: readonly ValidatedKey[]; leaseMilliseconds: number }> {
  if (
    !record(value) ||
    !Array.isArray(value.keys) ||
    value.keys.length < 1 ||
    value.keys.length > 8 ||
    !Number.isSafeInteger(value.leaseMilliseconds) ||
    value.leaseMilliseconds < 30_000 ||
    value.leaseMilliseconds > 15 * 60 * 1000
  )
    configurationInvalid();
  let previous = Number.POSITIVE_INFINITY;
  const values = new Set<string>();
  const keys = value.keys.map((candidate) => {
    if (!record(candidate)) configurationInvalid();
    const version = candidate.version;
    const encoded = candidate.value;
    if (
      Object.keys(candidate).length !== 2 ||
      typeof version !== "number" ||
      !Number.isSafeInteger(version) ||
      version < 0 ||
      version >= previous ||
      typeof encoded !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(encoded)
    )
      configurationInvalid();
    const bytes = Buffer.from(encoded, "base64url");
    if (
      bytes.length !== 32 ||
      bytes.toString("base64url") !== encoded ||
      values.has(encoded)
    )
      configurationInvalid();
    previous = version;
    values.add(encoded);
    return Object.freeze({ version, bytes });
  });
  return Object.freeze({
    keys: Object.freeze(keys),
    leaseMilliseconds: value.leaseMilliseconds,
  });
}

function referenceDigest(
  request: AuthenticationEmailRequest,
  key: ValidatedKey,
) {
  return digestText(key, REFERENCE_DOMAIN, [request.idempotencyReference]);
}

function requestDigest(request: AuthenticationEmailRequest, key: ValidatedKey) {
  return digestText(key, REQUEST_DOMAIN, [
    request.version,
    request.purpose,
    request.recipient,
    request.actionUrl,
    request.templateVersion,
    request.idempotencyReference,
  ]);
}

function digestText(
  key: ValidatedKey,
  domain: string,
  parts: readonly string[],
) {
  return `hmac-sha256:${key.version}:${hmac(key, domain, parts).toString("hex")}`;
}

function hmac(key: ValidatedKey, domain: string, parts: readonly string[]) {
  const digest = createHmac("sha256", key.bytes).update(domain);
  for (const part of parts) digest.update("\0").update(part);
  return digest.digest();
}

function equalDigest(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function validateProviderReference(
  result: AuthenticationEmailResult,
  value: unknown,
): string | null {
  if (result.disposition === "accepted") {
    if (!safeProviderReference(value)) configurationInvalid();
    return value;
  }
  if (result.disposition === "reconciliation-required") {
    if (value === undefined) return null;
    if (!safeProviderReference(value)) configurationInvalid();
    return value;
  }
  if (value !== undefined) configurationInvalid();
  return null;
}

function safeProviderReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function stateOutcome(
  value: string,
): AuthenticationEmailReservation["outcome"] {
  if (
    value === "accepted" ||
    value === "rejected" ||
    value === "retry" ||
    value === "reconciliation-required" ||
    value === "suppressed"
  )
    return value;
  configurationInvalid();
}

function reservation(
  outcome: AuthenticationEmailReservation["outcome"],
): AuthenticationEmailReservation {
  return Object.freeze({ version: "1.0.0", outcome });
}

function validInstant(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    configurationInvalid();
  return new Date(value.getTime());
}

function instant(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) configurationInvalid();
  return parsed;
}

function validateCanonicalOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) configurationInvalid();
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin !== value
    )
      configurationInvalid();
    return url.origin;
  } catch {
    configurationInvalid();
  }
}

function isPurpose(value: unknown): value is AuthenticationEmailPurpose {
  return value === "verify-email" || value === "reset-password";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configurationInvalid(): never {
  throw new AuthenticationEmailConfigurationError();
}
