import "server-only";

export const AUTHENTICATION_EMAIL_REQUEST_VERSION = "1.0.0" as const;
export const AUTHENTICATION_EMAIL_RESULT_VERSION = "1.0.0" as const;

export const AUTHENTICATION_EMAIL_TEMPLATE_VERSIONS = Object.freeze({
  "verify-email": "auth.verify-email.en-CA.1",
  "reset-password": "auth.reset-password.en-CA.1",
} as const);

export type AuthenticationEmailPurpose =
  keyof typeof AUTHENTICATION_EMAIL_TEMPLATE_VERSIONS;

export interface AuthenticationEmailRequest {
  readonly version: typeof AUTHENTICATION_EMAIL_REQUEST_VERSION;
  readonly purpose: AuthenticationEmailPurpose;
  readonly recipient: string;
  readonly actionUrl: string;
  readonly templateVersion:
    "auth.verify-email.en-CA.1" | "auth.reset-password.en-CA.1";
  readonly idempotencyReference: string;
}

export type AuthenticationEmailDisposition =
  "accepted" | "rejected" | "retry" | "reconciliation-required" | "suppressed";

export type AuthenticationEmailResult = Readonly<
  | {
      version: typeof AUTHENTICATION_EMAIL_RESULT_VERSION;
      disposition: "accepted";
      code: "EMAIL_ACCEPTED";
    }
  | {
      version: typeof AUTHENTICATION_EMAIL_RESULT_VERSION;
      disposition: "rejected";
      code: "EMAIL_REJECTED";
    }
  | {
      version: typeof AUTHENTICATION_EMAIL_RESULT_VERSION;
      disposition: "retry";
      code: "EMAIL_RETRY";
    }
  | {
      version: typeof AUTHENTICATION_EMAIL_RESULT_VERSION;
      disposition: "reconciliation-required";
      code: "EMAIL_RECONCILIATION_REQUIRED";
    }
  | {
      version: typeof AUTHENTICATION_EMAIL_RESULT_VERSION;
      disposition: "suppressed";
      code: "EMAIL_SUPPRESSED";
    }
>;

export interface AuthenticationEmailDispatcher {
  dispatch(
    request: AuthenticationEmailRequest,
  ): Promise<AuthenticationEmailResult>;
}

export interface AuthenticationEmailIdempotencyReferenceFactory {
  create(
    input: Readonly<{
      purpose: AuthenticationEmailPurpose;
      token: string;
    }>,
  ): string;
}

export interface RenderedAuthenticationEmail {
  readonly version: "1.0.0";
  readonly purpose: AuthenticationEmailPurpose;
  readonly templateVersion: AuthenticationEmailRequest["templateVersion"];
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export class AuthenticationEmailConfigurationError extends Error {
  readonly code = "AUTHENTICATION_EMAIL_CONFIGURATION_UNAVAILABLE";

  constructor() {
    super("Authentication email configuration is unavailable");
    this.name = "AuthenticationEmailConfigurationError";
  }
}

export class AuthenticationEmailRequestError extends Error {
  readonly code = "AUTHENTICATION_EMAIL_REQUEST_INVALID";

  constructor() {
    super("Authentication email request is invalid");
    this.name = "AuthenticationEmailRequestError";
  }
}

export class AuthenticationEmailDeliveryError extends Error {
  readonly code = "AUTHENTICATION_EMAIL_DELIVERY_UNAVAILABLE";

  constructor() {
    super("Authentication email delivery is unavailable");
    this.name = "AuthenticationEmailDeliveryError";
  }
}

export function validateAuthenticationEmailRequest(
  value: unknown,
  canonicalOriginValue: unknown,
): AuthenticationEmailRequest {
  const canonicalOrigin = validateCanonicalOrigin(canonicalOriginValue);
  if (
    !exactRecord(value, [
      "version",
      "purpose",
      "recipient",
      "actionUrl",
      "templateVersion",
      "idempotencyReference",
    ]) ||
    value.version !== AUTHENTICATION_EMAIL_REQUEST_VERSION ||
    !isPurpose(value.purpose) ||
    !validRecipient(value.recipient) ||
    value.templateVersion !==
      AUTHENTICATION_EMAIL_TEMPLATE_VERSIONS[value.purpose] ||
    !validIdempotencyReference(value.idempotencyReference) ||
    !validActionUrl(value.actionUrl, canonicalOrigin, value.purpose)
  ) {
    throw new AuthenticationEmailRequestError();
  }

  return Object.freeze({
    version: AUTHENTICATION_EMAIL_REQUEST_VERSION,
    purpose: value.purpose,
    recipient: value.recipient,
    actionUrl: value.actionUrl,
    templateVersion: AUTHENTICATION_EMAIL_TEMPLATE_VERSIONS[value.purpose],
    idempotencyReference: value.idempotencyReference,
  });
}

export function validateAuthenticationEmailResult(
  value: unknown,
): AuthenticationEmailResult {
  if (
    !exactRecord(value, ["version", "disposition", "code"]) ||
    value.version !== AUTHENTICATION_EMAIL_RESULT_VERSION ||
    !validDispositionCode(value.disposition, value.code)
  ) {
    throw new AuthenticationEmailDeliveryError();
  }

  return Object.freeze({
    version: AUTHENTICATION_EMAIL_RESULT_VERSION,
    disposition: value.disposition,
    code: value.code,
  }) as AuthenticationEmailResult;
}

export function renderAuthenticationEmail(
  value: unknown,
  canonicalOrigin: string,
): RenderedAuthenticationEmail {
  const request = validateAuthenticationEmailRequest(value, canonicalOrigin);
  const action = escapeHtml(request.actionUrl);

  if (request.purpose === "verify-email") {
    return Object.freeze({
      version: "1.0.0",
      purpose: request.purpose,
      templateVersion: request.templateVersion,
      subject: "Verify your email address",
      text: `Verify your email address by opening this secure link:\n\n${request.actionUrl}\n\nThis link expires in one hour. If you did not request this, you can ignore this message.`,
      html: `<!doctype html><html lang="en-CA"><body><p>Verify your email address by opening this secure link:</p><p><a href="${action}">Verify email address</a></p><p>This link expires in one hour. If you did not request this, you can ignore this message.</p></body></html>`,
    });
  }

  return Object.freeze({
    version: "1.0.0",
    purpose: request.purpose,
    templateVersion: request.templateVersion,
    subject: "Reset your password",
    text: `Reset your password by opening this secure link:\n\n${request.actionUrl}\n\nThis link expires in one hour. If you did not request this, you can ignore this message.`,
    html: `<!doctype html><html lang="en-CA"><body><p>Reset your password by opening this secure link:</p><p><a href="${action}">Reset password</a></p><p>This link expires in one hour. If you did not request this, you can ignore this message.</p></body></html>`,
  });
}

export function createBetterAuthEmailCallbacks(input: {
  readonly canonicalOrigin: string;
  readonly dispatcher: AuthenticationEmailDispatcher;
  readonly idempotencyReferences: AuthenticationEmailIdempotencyReferenceFactory;
}): Readonly<{
  sendVerification(
    input: Readonly<{
      recipient: string;
      actionUrl: string;
      token: string;
    }>,
  ): Promise<void>;
  sendPasswordReset(
    input: Readonly<{
      recipient: string;
      actionUrl: string;
      token: string;
    }>,
  ): Promise<void>;
}> {
  const canonicalOrigin = validateCanonicalOrigin(input?.canonicalOrigin);
  if (
    !input ||
    !record(input.dispatcher) ||
    typeof input.dispatcher.dispatch !== "function" ||
    !record(input.idempotencyReferences) ||
    typeof input.idempotencyReferences.create !== "function"
  ) {
    throw new AuthenticationEmailConfigurationError();
  }

  const send = async (
    purpose: AuthenticationEmailPurpose,
    callback: Readonly<{
      recipient: string;
      actionUrl: string;
      token: string;
    }>,
  ): Promise<void> => {
    try {
      if (!exactRecord(callback, ["recipient", "actionUrl", "token"]))
        deliveryUnavailable();
      const idempotencyReference = input.idempotencyReferences.create(
        Object.freeze({ purpose, token: callback.token }),
      );
      const request = validateAuthenticationEmailRequest(
        {
          version: AUTHENTICATION_EMAIL_REQUEST_VERSION,
          purpose,
          recipient: callback.recipient,
          actionUrl: callback.actionUrl,
          templateVersion: AUTHENTICATION_EMAIL_TEMPLATE_VERSIONS[purpose],
          idempotencyReference,
        },
        canonicalOrigin,
      );
      const result = validateAuthenticationEmailResult(
        await input.dispatcher.dispatch(request),
      );
      if (result.disposition !== "accepted") deliveryUnavailable();
    } catch {
      deliveryUnavailable();
    }
  };

  return Object.freeze({
    sendVerification: (callback) => send("verify-email", callback),
    sendPasswordReset: (callback) => send("reset-password", callback),
  });
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
    ) {
      configurationInvalid();
    }
    return url.origin;
  } catch {
    configurationInvalid();
  }
}

function validRecipient(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 254 ||
    value !== value.toLowerCase() ||
    /[\u0000-\u0020\u007f-\uffff]/.test(value)
  )
    return false;
  const separator = value.lastIndexOf("@");
  if (separator < 1 || separator !== value.indexOf("@")) return false;
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) ||
    domain.length > 253 ||
    !domain.includes(".")
  )
    return false;
  return domain
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    );
}

function validIdempotencyReference(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length !== 43 ||
    !/^[A-Za-z0-9_-]{43}$/.test(value)
  )
    return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 32 && bytes.toString("base64url") === value;
}

function validActionUrl(
  value: unknown,
  canonicalOrigin: string,
  purpose: AuthenticationEmailPurpose,
): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== canonicalOrigin ||
      url.username ||
      url.password ||
      url.hash ||
      url.href !== value
    )
      return false;
    const entries = [...url.searchParams.entries()];
    if (purpose === "verify-email") {
      return (
        url.pathname === "/api/auth/verify-email" &&
        exactQueryNames(entries, ["token", "callbackURL"]) &&
        validVerificationToken(url.searchParams.get("token")) &&
        validCallbackUrl(
          url.searchParams.get("callbackURL"),
          canonicalOrigin,
          false,
        )
      );
    }
    return (
      /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]{24}$/.test(url.pathname) &&
      exactQueryNames(entries, ["callbackURL"]) &&
      validCallbackUrl(
        url.searchParams.get("callbackURL"),
        canonicalOrigin,
        true,
      )
    );
  } catch {
    return false;
  }
}

function validCallbackUrl(
  value: string | null,
  canonicalOrigin: string,
  allowEmpty: boolean,
): boolean {
  if (
    value === null ||
    value.length > 2048 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return false;
  if (value.length === 0) return allowEmpty;
  if (value.startsWith("//")) return false;
  try {
    const callback = new URL(value, canonicalOrigin);
    return (
      callback.protocol === "https:" &&
      callback.origin === canonicalOrigin &&
      !callback.username &&
      !callback.password &&
      !callback.hash
    );
  } catch {
    return false;
  }
}

function validVerificationToken(value: string | null): boolean {
  return (
    value !== null &&
    value.length <= 2048 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  );
}

function exactQueryNames(
  entries: readonly (readonly [string, string])[],
  expected: readonly string[],
): boolean {
  return (
    entries.length === expected.length &&
    entries.every(([key], index) => key === expected[index])
  );
}

function validDispositionCode(
  disposition: unknown,
  code: unknown,
): disposition is AuthenticationEmailDisposition {
  return (
    (disposition === "accepted" && code === "EMAIL_ACCEPTED") ||
    (disposition === "rejected" && code === "EMAIL_REJECTED") ||
    (disposition === "retry" && code === "EMAIL_RETRY") ||
    (disposition === "reconciliation-required" &&
      code === "EMAIL_RECONCILIATION_REQUIRED") ||
    (disposition === "suppressed" && code === "EMAIL_SUPPRESSED")
  );
}

function isPurpose(value: unknown): value is AuthenticationEmailPurpose {
  return value === "verify-email" || value === "reset-password";
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
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
