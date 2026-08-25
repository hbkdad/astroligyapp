import type { Pool } from "pg";

import {
  AuthenticationEmailFeedbackRepository,
  createAuthenticationEmailFeedbackProcessor,
  loadAuthenticationEmailFeedbackConfiguration,
} from "./authentication-email-feedback";
import {
  createAuthenticationEmailFeedbackWorker,
  type AuthenticationEmailFeedbackWorkerConfiguration,
} from "./authentication-email-feedback-worker";
import {
  createAuthenticationEmailSnsAuthenticator,
  type AuthenticationEmailSnsCertificateAuthority,
} from "./authentication-email-sns-authenticator";
import {
  createAuthenticationEmailSqsQueue,
  loadAuthenticationEmailSqsConfiguration,
  type AuthenticationEmailSqsCommandClient,
} from "./authentication-email-sqs-adapter";

export function createAuthenticationEmailFeedbackRuntime(input: {
  readonly environment: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly pool: Pick<Pool, "connect">;
  readonly certificateAuthority: AuthenticationEmailSnsCertificateAuthority;
  readonly sqsClient?: AuthenticationEmailSqsCommandClient;
  readonly workerConfiguration?: AuthenticationEmailFeedbackWorkerConfiguration;
  readonly clock?: () => Date;
}) {
  const feedbackConfiguration = loadAuthenticationEmailFeedbackConfiguration(
    input.environment,
  );
  const queueConfiguration = loadAuthenticationEmailSqsConfiguration(
    input.environment,
  );
  const repository = new AuthenticationEmailFeedbackRepository(
    input.pool,
    feedbackConfiguration,
    input.clock,
  );
  const authenticator = createAuthenticationEmailSnsAuthenticator({
    certificateAuthority: input.certificateAuthority,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });
  const processor = createAuthenticationEmailFeedbackProcessor({
    configuration: feedbackConfiguration,
    authenticator,
    repository,
  });
  const queue = createAuthenticationEmailSqsQueue({
    configuration: queueConfiguration,
    ...(input.sqsClient === undefined ? {} : { client: input.sqsClient }),
  });
  return createAuthenticationEmailFeedbackWorker({
    queue,
    processor,
    ...(input.workerConfiguration === undefined
      ? {}
      : { configuration: input.workerConfiguration }),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });
}
