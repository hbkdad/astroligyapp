import "server-only";

import {
  AccountSuspendedException,
  BadRequestException,
  LimitExceededException,
  MailFromDomainNotVerifiedException,
  MessageRejected,
  NotFoundException,
  SendEmailCommand,
  SendingPausedException,
  SESv2Client,
  TooManyRequestsException,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";

import {
  AUTHENTICATION_EMAIL_RESULT_VERSION,
  AuthenticationEmailConfigurationError,
  AuthenticationEmailDeliveryError,
  renderAuthenticationEmail,
  validateAuthenticationEmailRequest,
  type AuthenticationEmailDispatcher,
  type AuthenticationEmailRequest,
  type AuthenticationEmailResult,
} from "@/server/authentication-email";
import type {
  AuthenticationEmailIdempotencyRepository,
  AuthenticationEmailReservation,
} from "@/server/authentication-email-idempotency";

export interface SesAuthenticationEmailConfiguration {
  readonly region: "ca-central-1";
  readonly canonicalOrigin: string;
  readonly fromEmailAddress: string;
  readonly configurationSetName: string;
}

export interface SesAuthenticationEmailClient {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
}

export interface AuthenticationEmailSuppressionResolver {
  isSuppressed(recipient: string): Promise<boolean>;
}

export function createSesV2Client(): SESv2Client {
  return new SESv2Client({ region: "ca-central-1", maxAttempts: 1 });
}

export function loadSesAuthenticationEmailConfiguration(
  environment: NodeJS.ProcessEnv | Record<string, unknown>,
): Readonly<SesAuthenticationEmailConfiguration> {
  if (!record(environment)) configurationInvalid();
  if (
    Object.entries(environment).some(
      ([name, value]) =>
        name.startsWith("NEXT_PUBLIC_SES_AUTH_EMAIL") &&
        typeof value === "string" &&
        value.length > 0,
    )
  )
    configurationInvalid();
  return validateConfiguration({
    region: environment.SES_AUTH_EMAIL_REGION,
    canonicalOrigin: environment.BETTER_AUTH_BASE_URL,
    fromEmailAddress: environment.SES_AUTH_EMAIL_FROM,
    configurationSetName: environment.SES_AUTH_EMAIL_CONFIGURATION_SET,
  });
}

export function createSesAuthenticationEmailDispatcher(input: {
  readonly configuration: SesAuthenticationEmailConfiguration;
  readonly client: SesAuthenticationEmailClient;
  readonly idempotency: Pick<
    AuthenticationEmailIdempotencyRepository,
    "reserve" | "complete"
  >;
  readonly suppression: AuthenticationEmailSuppressionResolver;
}): AuthenticationEmailDispatcher {
  const configuration = validateConfiguration(input?.configuration);
  if (
    !record(input) ||
    !record(input.client) ||
    typeof input.client.send !== "function" ||
    !record(input.idempotency) ||
    typeof input.idempotency.reserve !== "function" ||
    typeof input.idempotency.complete !== "function" ||
    !record(input.suppression) ||
    typeof input.suppression.isSuppressed !== "function"
  )
    configurationInvalid();

  return Object.freeze({
    async dispatch(value: AuthenticationEmailRequest) {
      const request = validateAuthenticationEmailRequest(
        value,
        configuration.canonicalOrigin,
      );
      let reserved: AuthenticationEmailReservation;
      try {
        reserved = await input.idempotency.reserve(request);
      } catch {
        deliveryUnavailable();
      }
      const replay = replayResult(reserved!);
      if (replay) return replay;

      let suppressed: boolean;
      try {
        suppressed = await input.suppression.isSuppressed(request.recipient);
      } catch {
        return await complete(
          input.idempotency,
          request,
          result("reconciliation-required"),
        );
      }
      if (suppressed)
        return await complete(input.idempotency, request, result("suppressed"));

      const rendered = renderAuthenticationEmail(
        request,
        configuration.canonicalOrigin,
      );
      let response: SendEmailCommandOutput;
      try {
        response = await input.client.send(
          new SendEmailCommand({
            FromEmailAddress: configuration.fromEmailAddress,
            Destination: { ToAddresses: [request.recipient] },
            ConfigurationSetName: configuration.configurationSetName,
            Content: {
              Simple: {
                Subject: { Data: rendered.subject, Charset: "UTF-8" },
                Body: {
                  Text: { Data: rendered.text, Charset: "UTF-8" },
                  Html: { Data: rendered.html, Charset: "UTF-8" },
                },
              },
            },
          }),
        );
      } catch (error) {
        const disposition = definiteRetry(error)
          ? "retry"
          : definiteReject(error)
            ? "rejected"
            : "reconciliation-required";
        return await complete(input.idempotency, request, result(disposition));
      }
      if (!safeProviderReference(response.MessageId))
        return await complete(
          input.idempotency,
          request,
          result("reconciliation-required"),
        );
      return await complete(
        input.idempotency,
        request,
        result("accepted"),
        response.MessageId,
      );
    },
  });
}

async function complete(
  repository: Pick<AuthenticationEmailIdempotencyRepository, "complete">,
  request: AuthenticationEmailRequest,
  deliveryResult: AuthenticationEmailResult,
  providerMessageReference?: string,
): Promise<AuthenticationEmailResult> {
  let stored: AuthenticationEmailReservation;
  try {
    stored = await repository.complete(
      request,
      deliveryResult,
      providerMessageReference,
    );
  } catch {
    deliveryUnavailable();
  }
  return resultFromReservation(stored!);
}

function replayResult(
  reservation: AuthenticationEmailReservation,
): AuthenticationEmailResult | null {
  if (!validReservation(reservation)) deliveryUnavailable();
  if (reservation.outcome === "reserved") return null;
  if (reservation.outcome === "in-progress") return result("retry");
  if (reservation.outcome === "collision") return result("rejected");
  return result(reservation.outcome);
}

function resultFromReservation(
  reservation: AuthenticationEmailReservation,
): AuthenticationEmailResult {
  if (!validReservation(reservation)) deliveryUnavailable();
  if (reservation.outcome === "reserved") deliveryUnavailable();
  if (reservation.outcome === "in-progress") return result("retry");
  if (reservation.outcome === "collision") return result("rejected");
  return result(reservation.outcome);
}

function validReservation(
  value: unknown,
): value is AuthenticationEmailReservation {
  return (
    record(value) &&
    Object.keys(value).length === 2 &&
    value.version === "1.0.0" &&
    (value.outcome === "reserved" ||
      value.outcome === "in-progress" ||
      value.outcome === "accepted" ||
      value.outcome === "rejected" ||
      value.outcome === "retry" ||
      value.outcome === "reconciliation-required" ||
      value.outcome === "suppressed" ||
      value.outcome === "collision")
  );
}

function result(
  disposition: AuthenticationEmailResult["disposition"],
): AuthenticationEmailResult {
  const codes = {
    accepted: "EMAIL_ACCEPTED",
    rejected: "EMAIL_REJECTED",
    retry: "EMAIL_RETRY",
    "reconciliation-required": "EMAIL_RECONCILIATION_REQUIRED",
    suppressed: "EMAIL_SUPPRESSED",
  } as const;
  return Object.freeze({
    version: AUTHENTICATION_EMAIL_RESULT_VERSION,
    disposition,
    code: codes[disposition],
  }) as AuthenticationEmailResult;
}

function definiteRetry(error: unknown): boolean {
  return (
    error instanceof TooManyRequestsException ||
    error instanceof LimitExceededException
  );
}

function definiteReject(error: unknown): boolean {
  return (
    error instanceof MessageRejected ||
    error instanceof MailFromDomainNotVerifiedException ||
    error instanceof AccountSuspendedException ||
    error instanceof SendingPausedException ||
    error instanceof BadRequestException ||
    error instanceof NotFoundException
  );
}

function validateConfiguration(
  value: unknown,
): Readonly<SesAuthenticationEmailConfiguration> {
  if (
    !record(value) ||
    Object.keys(value).length !== 4 ||
    value.region !== "ca-central-1" ||
    !exactOrigin(value.canonicalOrigin) ||
    !safeEmail(value.fromEmailAddress) ||
    !safeConfigurationSet(value.configurationSetName)
  )
    configurationInvalid();
  return Object.freeze({
    region: "ca-central-1",
    canonicalOrigin: value.canonicalOrigin,
    fromEmailAddress: value.fromEmailAddress,
    configurationSetName: value.configurationSetName,
  });
}

function exactOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

function safeEmail(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    value !== value.toLowerCase() ||
    /[\u0000-\u0020\u007f-\uffff]/.test(value)
  )
    return false;
  const separator = value.lastIndexOf("@");
  if (separator < 1 || separator !== value.indexOf("@")) return false;
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  return (
    local.length <= 64 &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..") &&
    /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) &&
    domain.includes(".") &&
    domain
      .split(".")
      .every(
        (label) =>
          label.length > 0 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  );
}

function safeConfigurationSet(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function safeProviderReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configurationInvalid(): never {
  throw new AuthenticationEmailConfigurationError();
}

function deliveryUnavailable(): never {
  throw new AuthenticationEmailDeliveryError();
}
