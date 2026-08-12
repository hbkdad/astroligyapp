import "server-only";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { betterAuthSchema } from "@/db/auth-schema";
import {
  createBetterAuthEmailCallbacks,
  type AuthenticationEmailDispatcher,
  type AuthenticationEmailIdempotencyReferenceFactory,
} from "@/server/authentication-email";

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;
const ONE_DAY_SECONDS = 60 * 60 * 24;
const TEN_MINUTES_SECONDS = 60 * 10;

export interface BetterAuthEmailDependencies {
  readonly dispatcher: AuthenticationEmailDispatcher;
  readonly idempotencyReferences: AuthenticationEmailIdempotencyReferenceFactory;
}

export interface BetterAuthSecret {
  readonly version: number;
  readonly value: string;
}

export interface BetterAuthConfiguration {
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly secrets: readonly BetterAuthSecret[];
  readonly production: boolean;
  readonly proxy?: Readonly<{
    ipAddressHeaders: readonly string[];
    trustedProxies: readonly string[];
  }>;
}

export class BetterAuthConfigurationError extends Error {
  readonly code = "AUTH_CONFIGURATION_UNAVAILABLE";

  constructor() {
    super("Authentication configuration is unavailable");
    this.name = "BetterAuthConfigurationError";
  }
}

export function loadBetterAuthConfiguration(
  environmentValue: NodeJS.ProcessEnv | Record<string, unknown>,
): Readonly<BetterAuthConfiguration> {
  if (!record(environmentValue)) invalid();
  if (
    Object.entries(environmentValue).some(
      ([key, value]) =>
        key.startsWith("NEXT_PUBLIC_BETTER_AUTH") &&
        typeof value === "string" &&
        value.length > 0,
    )
  )
    invalid();

  const production = environmentValue.NODE_ENV === "production";
  if (
    environmentValue.NODE_ENV !== undefined &&
    !["production", "development", "test"].includes(
      String(environmentValue.NODE_ENV),
    )
  )
    invalid();
  const baseUrl = stringValue(environmentValue.BETTER_AUTH_BASE_URL);
  const trustedOrigins = commaValues(
    environmentValue.BETTER_AUTH_TRUSTED_ORIGINS,
  );
  const secrets = secretValues(environmentValue.BETTER_AUTH_SECRETS);
  const ipAddressHeaders = commaValues(environmentValue.BETTER_AUTH_IP_HEADER);
  const trustedProxies = commaValues(
    environmentValue.BETTER_AUTH_TRUSTED_PROXIES,
  );
  if (!baseUrl || !trustedOrigins || !secrets) invalid();
  if ((ipAddressHeaders === null) !== (trustedProxies === null)) invalid();

  return validateConfiguration({
    baseUrl,
    trustedOrigins,
    secrets,
    production,
    ...(ipAddressHeaders && trustedProxies
      ? { proxy: { ipAddressHeaders, trustedProxies } }
      : {}),
  });
}

export function createBetterAuth(
  db: NodePgDatabase<typeof betterAuthSchema>,
  email: BetterAuthEmailDependencies,
  configurationValue: BetterAuthConfiguration,
) {
  const configuration = validateConfiguration(configurationValue);

  return betterAuth(createBetterAuthOptions(db, email, configuration));
}

export function createBetterAuthOptions(
  db: NodePgDatabase<typeof betterAuthSchema>,
  email: BetterAuthEmailDependencies,
  configurationValue: BetterAuthConfiguration,
): BetterAuthOptions {
  const configuration = validateConfiguration(configurationValue);
  const emailCallbacks = () =>
    createBetterAuthEmailCallbacks({
      canonicalOrigin: configuration.baseUrl,
      dispatcher: email.dispatcher,
      idempotencyReferences: email.idempotencyReferences,
    });

  return {
    appName: "Personal Cosmic Calendar",
    baseURL: configuration.baseUrl,
    basePath: "/api/auth",
    trustedOrigins: [...configuration.trustedOrigins],
    secrets: configuration.secrets.map((secret) => ({ ...secret })),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: betterAuthSchema,
      usePlural: false,
      camelCase: false,
      transaction: true,
      debugLogs: false,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        await emailCallbacks().sendPasswordReset(
          Object.freeze({ recipient: user.email, actionUrl: url, token }),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url, token }) => {
        await emailCallbacks().sendVerification(
          Object.freeze({ recipient: user.email, actionUrl: url, token }),
        );
      },
    },
    user: {
      changeEmail: {
        enabled: false,
        updateEmailWithoutVerification: false,
      },
      deleteUser: { enabled: false },
    },
    session: {
      expiresIn: SEVEN_DAYS_SECONDS,
      updateAge: ONE_DAY_SECONDS,
      freshAge: TEN_MINUTES_SECONDS,
      disableSessionRefresh: false,
      deferSessionRefresh: false,
      cookieCache: {
        enabled: false,
        refreshCache: false,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "memory",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60 * 10, max: 5 },
        "/request-password-reset": { window: 60 * 10, max: 5 },
        "/send-verification-email": { window: 60 * 10, max: 5 },
      },
    },
    logger: { disabled: true },
    advanced: {
      useSecureCookies: configuration.production,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      crossSubDomainCookies: { enabled: false },
      cookiePrefix: "cosmic-auth",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: configuration.production,
        sameSite: "lax",
        path: "/",
      },
      ipAddress: configuration.proxy
        ? {
            ipAddressHeaders: [...configuration.proxy.ipAddressHeaders],
            trustedProxies: [...configuration.proxy.trustedProxies],
            ipv6Subnet: 64,
          }
        : { ipv6Subnet: 64 },
    },
    telemetry: { enabled: false, debug: false },
    secondaryStorage: undefined,
    socialProviders: {},
    plugins: [],
  };
}

function validateConfiguration(
  value: BetterAuthConfiguration,
): Readonly<BetterAuthConfiguration> {
  if (!record(value) || typeof value.production !== "boolean") invalid();

  const baseUrl = exactOrigin(value.baseUrl, value.production);
  if (!baseUrl) invalid();

  if (
    !Array.isArray(value.trustedOrigins) ||
    value.trustedOrigins.length === 0 ||
    value.trustedOrigins.length > 16
  )
    invalid();
  const trustedOrigins = value.trustedOrigins.map((origin) =>
    exactOrigin(origin, value.production),
  );
  if (
    trustedOrigins.some((origin) => origin === null) ||
    new Set(trustedOrigins).size !== trustedOrigins.length ||
    !trustedOrigins.includes(baseUrl)
  )
    invalid();

  if (!Array.isArray(value.secrets) || value.secrets.length === 0) invalid();
  let previousVersion = Number.POSITIVE_INFINITY;
  const secretValues = new Set<string>();
  const secrets = value.secrets.map((secret) => {
    if (
      !record(secret) ||
      typeof secret.version !== "number" ||
      !Number.isSafeInteger(secret.version) ||
      secret.version < 0 ||
      secret.version >= previousVersion ||
      typeof secret.value !== "string" ||
      secret.value.length < 32 ||
      secret.value.length > 512 ||
      /[\u0000-\u001f\u007f]/.test(secret.value) ||
      secretValues.has(secret.value)
    )
      invalid();
    previousVersion = secret.version;
    secretValues.add(secret.value);
    return Object.freeze({ version: secret.version, value: secret.value });
  });

  let proxy: BetterAuthConfiguration["proxy"];
  if (value.proxy !== undefined) {
    if (
      !record(value.proxy) ||
      !validHeaderNames(value.proxy.ipAddressHeaders) ||
      !validProxyEntries(value.proxy.trustedProxies)
    )
      invalid();
    proxy = Object.freeze({
      ipAddressHeaders: Object.freeze([...value.proxy.ipAddressHeaders]),
      trustedProxies: Object.freeze([...value.proxy.trustedProxies]),
    });
  }
  if (value.production && !proxy) invalid();

  const configuration = Object.freeze({
    baseUrl,
    trustedOrigins: Object.freeze(trustedOrigins as string[]),
    secrets: Object.freeze(secrets),
    production: value.production,
  });
  return proxy ? Object.freeze({ ...configuration, proxy }) : configuration;
}

function exactOrigin(value: unknown, production: boolean): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (production && url.protocol !== "https:") ||
      (!production &&
        url.protocol !== "https:" &&
        !(local && url.protocol === "http:"))
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validHeaderNames(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string" &&
    /^(?:cf-connecting-ip|x-real-ip|x-forwarded-for)$/.test(value[0])
  );
}

function validProxyEntries(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 16 &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length <= 64 &&
        /^[0-9a-f:.]+(?:\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8]))?$/i.test(
          entry,
        ),
    )
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function commaValues(value: unknown): string[] | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const values = value.split(",");
  return values.length > 0 && values.every((entry) => entry.length > 0)
    ? values
    : null;
}

function secretValues(value: unknown): BetterAuthSecret[] | null {
  const entries = commaValues(value);
  if (!entries) return null;
  const result: BetterAuthSecret[] = [];
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator < 1 || separator === entry.length - 1) return null;
    const version = Number(entry.slice(0, separator));
    result.push({ version, value: entry.slice(separator + 1) });
  }
  return result;
}

function invalid(): never {
  throw new BetterAuthConfigurationError();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
