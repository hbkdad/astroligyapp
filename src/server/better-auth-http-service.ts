import "server-only";

import type { SESv2Client } from "@aws-sdk/client-sesv2";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { betterAuthSchema } from "@/db/auth-schema";
import { LocalAccountDeletionRepository } from "@/infrastructure/auth/account";
import { PrivateProfileRepository } from "@/infrastructure/persistence/private-profile-repository";
import { ProtectedNatalChartRepository } from "@/infrastructure/persistence/protected-natal-chart-repository";
import { PersonalTodayRepository } from "@/infrastructure/persistence/personal-today-repository";
import {
  BetterAuthAccountBootstrapper,
  BetterAuthActiveBillingAccountResolver,
  BetterAuthCurrentPasswordReauthenticator,
  BetterAuthVerifiedSessionVerifier,
  IdentityScopedAccountReadinessVerifier,
} from "@/infrastructure/auth/better-auth-adapters";
import {
  deleteAccountForRequest,
  type AuthenticatedAccountDeletionResult,
} from "@/server/authenticated-account-deletion";
import {
  loadPrivateProfilesForRequest,
  mutatePrivateProfileForRequest,
  type PrivateProfileMutationResult,
  type PrivateProfileReadResult,
} from "@/server/authenticated-private-profiles";
import type { PrivateProfileCommand } from "@/server/private-profile-contracts";
import {
  generateProtectedNatalChartForRequest,
  loadProtectedNatalChartsForRequest,
  type ProtectedNatalMutationResult,
  type ProtectedNatalReadResult,
} from "@/server/authenticated-protected-natal-chart";
import type { ProtectedNatalChartCommand } from "@/server/protected-natal-chart-contracts";
import {
  loadPersonalTodayForRequest,
  type PersonalTodayResponse,
} from "@/server/authenticated-personal-today";
import type { PersonalTodayCommand } from "@/server/personal-today-contracts";
import {
  bootstrapAccountForRequest,
  type AuthenticatedAccountBootstrapResult,
} from "@/server/authenticated-account-bootstrap";
import {
  createBetterAuth,
  loadBetterAuthConfiguration,
  type BetterAuthConfiguration,
} from "@/server/better-auth-configuration";
import { AuthenticationEmailFeedbackRepository } from "@/server/authentication-email-feedback";
import {
  AuthenticationEmailIdempotencyRepository,
  createAuthenticationEmailIdempotencyReferenceFactory,
  loadAuthenticationEmailIdempotencyConfiguration,
} from "@/server/authentication-email-idempotency";
import type { BetterAuthHttpService } from "@/server/better-auth-http";
import {
  createSesAuthenticationEmailDispatcher,
  createSesV2Client,
  loadSesAuthenticationEmailConfiguration,
} from "@/server/ses-authentication-email-adapter";
import { loadAuthenticationEmailFeedbackConfiguration } from "@/server/authentication-email-feedback";

const PROHIBITED_PUBLIC_KEYS = [
  "NEXT_PUBLIC_BETTER_AUTH_DATABASE_URL",
  "NEXT_PUBLIC_AUTH_ACCOUNT_DATABASE_URL",
  "NEXT_PUBLIC_AUTH_EMAIL_DATABASE_URL",
  "NEXT_PUBLIC_AUTH_EMAIL_FEEDBACK_DATABASE_URL",
] as const;

export interface BetterAuthHttpServiceConfiguration {
  readonly auth: BetterAuthConfiguration;
  readonly authDatabaseUrl: string;
  readonly accountDatabaseUrl: string;
  readonly emailDatabaseUrl: string;
  readonly feedbackDatabaseUrl: string;
  readonly idempotency: ReturnType<
    typeof loadAuthenticationEmailIdempotencyConfiguration
  >;
  readonly feedback: ReturnType<
    typeof loadAuthenticationEmailFeedbackConfiguration
  >;
  readonly ses: ReturnType<typeof loadSesAuthenticationEmailConfiguration>;
}

export interface ProductionBetterAuthHttpService extends BetterAuthHttpService {
  readonly canonicalOrigin: string;
  activateAccount(
    request: Request,
  ): Promise<AuthenticatedAccountBootstrapResult>;
  deleteAccount(request: Request): Promise<AuthenticatedAccountDeletionResult>;
  loadPrivateProfiles(request: Request): Promise<PrivateProfileReadResult>;
  mutatePrivateProfile(
    request: Request,
    command: PrivateProfileCommand,
  ): Promise<PrivateProfileMutationResult>;
  generateProtectedNatalChart(
    request: Request,
    command: ProtectedNatalChartCommand,
  ): Promise<ProtectedNatalMutationResult>;
  loadProtectedNatalCharts(request: Request): Promise<ProtectedNatalReadResult>;
  loadPersonalToday(
    request: Request,
    command: PersonalTodayCommand,
  ): Promise<PersonalTodayResponse>;
  close(): Promise<void>;
}

export class BetterAuthHttpServiceConfigurationError extends Error {
  constructor() {
    super("Authentication HTTP service configuration is unavailable");
    this.name = "BetterAuthHttpServiceConfigurationError";
  }
}

export function loadBetterAuthHttpServiceConfiguration(
  environment: NodeJS.ProcessEnv | Record<string, unknown>,
): Readonly<BetterAuthHttpServiceConfiguration> {
  if (!record(environment)) invalid();
  if (
    PROHIBITED_PUBLIC_KEYS.some(
      (key) =>
        typeof environment[key] === "string" && environment[key].length > 0,
    )
  )
    invalid();
  try {
    return Object.freeze({
      auth: loadBetterAuthConfiguration(environment),
      authDatabaseUrl: databaseUrl(environment.BETTER_AUTH_DATABASE_URL),
      accountDatabaseUrl: databaseUrl(environment.AUTH_ACCOUNT_DATABASE_URL),
      emailDatabaseUrl: databaseUrl(environment.AUTH_EMAIL_DATABASE_URL),
      feedbackDatabaseUrl: databaseUrl(
        environment.AUTH_EMAIL_FEEDBACK_DATABASE_URL,
      ),
      idempotency: loadAuthenticationEmailIdempotencyConfiguration(environment),
      feedback: loadAuthenticationEmailFeedbackConfiguration(environment),
      ses: loadSesAuthenticationEmailConfiguration(environment),
    });
  } catch {
    invalid();
  }
}

export function createBetterAuthHttpService(
  configuration: BetterAuthHttpServiceConfiguration,
  createSesClient: () => SESv2Client = createSesV2Client,
): ProductionBetterAuthHttpService {
  const authPool = pool(configuration.authDatabaseUrl, 8);
  const accountPool = pool(configuration.accountDatabaseUrl, 4);
  const emailPool = pool(configuration.emailDatabaseUrl, 4);
  const feedbackPool = pool(configuration.feedbackDatabaseUrl, 4);
  let sesClient: SESv2Client;
  try {
    sesClient = createSesClient();
    const idempotency = new AuthenticationEmailIdempotencyRepository(
      emailPool,
      configuration.idempotency,
      configuration.auth.baseUrl,
    );
    const feedback = new AuthenticationEmailFeedbackRepository(
      feedbackPool,
      configuration.feedback,
    );
    const dispatcher = createSesAuthenticationEmailDispatcher({
      configuration: configuration.ses,
      client: sesClient,
      idempotency,
      suppression: feedback,
    });
    const auth = createBetterAuth(
      drizzle(authPool, { schema: betterAuthSchema }),
      {
        dispatcher,
        idempotencyReferences:
          createAuthenticationEmailIdempotencyReferenceFactory(
            configuration.idempotency,
          ),
      },
      configuration.auth,
    );
    const activationDependencies = Object.freeze({
      sessionVerifier: new BetterAuthVerifiedSessionVerifier(auth.api),
      bootstrapper: new BetterAuthAccountBootstrapper(accountPool),
      accountResolver: new BetterAuthActiveBillingAccountResolver(accountPool),
      readinessVerifier: new IdentityScopedAccountReadinessVerifier(
        accountPool,
      ),
    });
    const deletionDependencies = Object.freeze({
      canonicalOrigin: configuration.auth.baseUrl,
      sessionVerifier: new BetterAuthVerifiedSessionVerifier(auth.api),
      accountResolver: new BetterAuthActiveBillingAccountResolver(accountPool),
      passwordReauthenticator: new BetterAuthCurrentPasswordReauthenticator(
        auth.api,
      ),
      eraser: new LocalAccountDeletionRepository(accountPool),
    });
    const privateProfileDependencies = Object.freeze({
      sessionVerifier: new BetterAuthVerifiedSessionVerifier(auth.api),
      accountResolver: new BetterAuthActiveBillingAccountResolver(accountPool),
      profiles: new PrivateProfileRepository(accountPool),
    });
    const protectedNatalDependencies = Object.freeze({
      sessionVerifier: new BetterAuthVerifiedSessionVerifier(auth.api),
      accountResolver: new BetterAuthActiveBillingAccountResolver(accountPool),
      charts: new ProtectedNatalChartRepository(accountPool),
    });
    const personalTodayDependencies = Object.freeze({
      sessionVerifier: new BetterAuthVerifiedSessionVerifier(auth.api),
      accountResolver: new BetterAuthActiveBillingAccountResolver(accountPool),
      today: new PersonalTodayRepository(accountPool),
    });
    let closed = false;
    return Object.freeze({
      canonicalOrigin: configuration.auth.baseUrl,
      async handle(request: Request) {
        if (closed)
          throw new Error("Authentication HTTP service is unavailable");
        return auth.handler(request);
      },
      async activateAccount(request: Request) {
        if (closed)
          throw new Error("Authentication HTTP service is unavailable");
        return bootstrapAccountForRequest(request, activationDependencies);
      },
      async deleteAccount(request: Request) {
        if (closed)
          throw new Error("Authentication HTTP service is unavailable");
        return deleteAccountForRequest(request, deletionDependencies);
      },
      async loadPrivateProfiles(request: Request) {
        if (closed)
          throw new Error("Authentication HTTP service is unavailable");
        return loadPrivateProfilesForRequest(
          request,
          privateProfileDependencies,
        );
      },
      async mutatePrivateProfile(
        request: Request,
        command: PrivateProfileCommand,
      ) {
        if (closed)
          throw new Error("Authentication HTTP service is unavailable");
        return mutatePrivateProfileForRequest(
          request,
          command,
          privateProfileDependencies,
        );
      },
      async generateProtectedNatalChart(
        request: Request,
        command: ProtectedNatalChartCommand,
      ) {
        if (closed)
          throw new Error("Authentication HTTP service is unavailable");
        return generateProtectedNatalChartForRequest(
          request,
          command,
          protectedNatalDependencies,
        );
      },
      async loadProtectedNatalCharts(request: Request) {
        if (closed)
          throw new Error("Authentication HTTP service is unavailable");
        return loadProtectedNatalChartsForRequest(
          request,
          protectedNatalDependencies,
        );
      },
      async loadPersonalToday(request: Request, command: PersonalTodayCommand) {
        if (closed)
          throw new Error("Authentication HTTP service is unavailable");
        return loadPersonalTodayForRequest(
          request,
          command,
          personalTodayDependencies,
        );
      },
      async close() {
        if (closed) return;
        closed = true;
        sesClient.destroy();
        await Promise.all([
          authPool.end(),
          accountPool.end(),
          emailPool.end(),
          feedbackPool.end(),
        ]);
      },
    });
  } catch (error) {
    void authPool.end();
    void accountPool.end();
    void emailPool.end();
    void feedbackPool.end();
    throw error;
  }
}

let processService: ProductionBetterAuthHttpService | undefined;

export function productionBetterAuthHttpService(): ProductionBetterAuthHttpService {
  if (processService) return processService;
  processService = createBetterAuthHttpService(
    loadBetterAuthHttpServiceConfiguration(process.env),
  );
  return processService;
}

function pool(connectionString: string, maximum: number): Pool {
  return new Pool({
    connectionString,
    max: maximum,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  });
}

function databaseUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2_048 ||
    /[\0\r\n]/.test(value)
  )
    invalid();
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "postgresql:" && url.protocol !== "postgres:") ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    )
      invalid();
    return value;
  } catch {
    invalid();
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new BetterAuthHttpServiceConfigurationError();
}
