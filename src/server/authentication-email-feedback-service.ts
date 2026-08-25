import { isIP } from "node:net";

import { Pool } from "pg";

import type { AuthenticationEmailFeedbackWorkerCycle } from "./authentication-email-feedback-worker";

const MAXIMUM_DATABASE_CONNECTIONS = 4;

export type AuthenticationEmailFeedbackServiceConfiguration = Readonly<{
  version: "1.0.0";
  databaseUrl: string;
  maximumDatabaseConnections: 4;
}>;

export interface AuthenticationEmailFeedbackRunnableWorker {
  run(
    signal: AbortSignal,
    report: (cycle: AuthenticationEmailFeedbackWorkerCycle) => void,
  ): Promise<void>;
}

export interface AuthenticationEmailFeedbackClosablePool {
  end(): Promise<void>;
}

export function loadAuthenticationEmailFeedbackServiceConfiguration(
  environment: NodeJS.ProcessEnv | Record<string, unknown>,
): AuthenticationEmailFeedbackServiceConfiguration {
  if (!record(environment)) invalid();
  for (const name of [
    "NEXT_PUBLIC_AUTH_EMAIL_FEEDBACK_DATABASE_URL",
    "NEXT_PUBLIC_AUTH_EMAIL_FEEDBACK_KEYS",
    "NEXT_PUBLIC_SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL",
  ]) {
    if (typeof environment[name] === "string" && environment[name].length > 0)
      invalid();
  }
  for (const name of [
    "AWS_ENDPOINT_URL",
    "AWS_ENDPOINT_URL_SQS",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_PROFILE",
    "AWS_SHARED_CREDENTIALS_FILE",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AWS_ROLE_ARN",
    "AWS_EC2_METADATA_SERVICE_ENDPOINT",
    "AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE",
  ]) {
    if (typeof environment[name] === "string" && environment[name].length > 0)
      invalid();
  }

  if (environment.NODE_ENV === "production") {
    const relativeCredentialsUri =
      environment.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    if (
      environment.AWS_EC2_METADATA_DISABLED !== "true" ||
      typeof relativeCredentialsUri !== "string" ||
      !/^\/v2\/credentials\/[A-Za-z0-9_-]{1,256}$/u.test(relativeCredentialsUri)
    )
      invalid();
  }

  const value = environment.AUTH_EMAIL_FEEDBACK_DATABASE_URL;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2_048 ||
    /[\0\r\n]/u.test(value)
  )
    invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid();
  }
  if (
    (url.protocol !== "postgresql:" && url.protocol !== "postgres:") ||
    url.username.length === 0 ||
    url.password.length === 0 ||
    url.hostname.length === 0 ||
    url.pathname.length < 2 ||
    url.hash.length > 0
  )
    invalid();
  const localInsecure =
    environment.AUTH_EMAIL_FEEDBACK_DATABASE_ALLOW_INSECURE_LOCAL === "true";
  const localHost =
    url.hostname === "localhost" ||
    url.hostname === "postgres" ||
    isIP(url.hostname) !== 0;
  if (
    url.searchParams.get("sslmode") !== "verify-full" &&
    !(localInsecure && localHost && url.searchParams.get("sslmode") === null)
  )
    invalid();

  return Object.freeze({
    version: "1.0.0",
    databaseUrl: value,
    maximumDatabaseConnections: MAXIMUM_DATABASE_CONNECTIONS,
  });
}

export function createAuthenticationEmailFeedbackServicePool(
  configuration: AuthenticationEmailFeedbackServiceConfiguration,
) {
  validateConfiguration(configuration);
  return new Pool({
    connectionString: configuration.databaseUrl,
    max: configuration.maximumDatabaseConnections,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  });
}

export async function runAuthenticationEmailFeedbackService(input: {
  readonly worker: AuthenticationEmailFeedbackRunnableWorker;
  readonly pool: AuthenticationEmailFeedbackClosablePool;
  readonly signal: AbortSignal;
  readonly report: (content: string) => void;
  readonly configuration: AuthenticationEmailFeedbackServiceConfiguration;
}): Promise<void> {
  if (
    !record(input) ||
    !record(input.worker) ||
    typeof input.worker.run !== "function" ||
    !record(input.pool) ||
    typeof input.pool.end !== "function" ||
    !(input.signal instanceof AbortSignal) ||
    typeof input.report !== "function"
  )
    invalid();
  validateConfiguration(input.configuration);
  try {
    await input.worker.run(input.signal, (cycle) =>
      input.report(serializeAuthenticationEmailFeedbackCycle(cycle)),
    );
  } finally {
    await input.pool.end();
  }
}

export function serializeAuthenticationEmailFeedbackCycle(
  cycle: AuthenticationEmailFeedbackWorkerCycle,
) {
  return JSON.stringify({
    version: "1.0.0",
    event: "authentication-email-feedback-worker-cycle",
    disposition: cycle.disposition,
    received: cycle.received,
    acknowledged: cycle.acknowledged,
    retried: cycle.retried,
    reconciled: cycle.reconciled,
    invalid: cycle.invalid,
    deleteFailures: cycle.deleteFailures,
    visibilityFailures: cycle.visibilityFailures,
    oldestMessageAgeSeconds: cycle.oldestMessageAgeSeconds,
  });
}

function validateConfiguration(value: unknown) {
  if (
    !record(value) ||
    value.version !== "1.0.0" ||
    typeof value.databaseUrl !== "string" ||
    value.maximumDatabaseConnections !== MAXIMUM_DATABASE_CONNECTIONS
  )
    invalid();
  return value as AuthenticationEmailFeedbackServiceConfiguration;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new TypeError("Invalid authentication email feedback service input");
}
