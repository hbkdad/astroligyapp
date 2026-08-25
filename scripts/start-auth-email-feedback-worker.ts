import { createAuthenticationEmailFeedbackRuntime } from "../src/server/authentication-email-feedback-runtime";
import {
  createAuthenticationEmailFeedbackServicePool,
  loadAuthenticationEmailFeedbackServiceConfiguration,
  runAuthenticationEmailFeedbackService,
} from "../src/server/authentication-email-feedback-service";
import { createHttpsAuthenticationEmailSnsCertificateAuthority } from "../src/server/authentication-email-sns-authenticator";

const controller = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => controller.abort());
}

let pool:
  ReturnType<typeof createAuthenticationEmailFeedbackServicePool> | undefined;
let serviceOwnsPool = false;
try {
  const configuration = loadAuthenticationEmailFeedbackServiceConfiguration(
    process.env,
  );
  pool = createAuthenticationEmailFeedbackServicePool(configuration);
  const worker = createAuthenticationEmailFeedbackRuntime({
    environment: process.env,
    pool,
    certificateAuthority:
      createHttpsAuthenticationEmailSnsCertificateAuthority(),
  });
  serviceOwnsPool = true;
  await runAuthenticationEmailFeedbackService({
    worker,
    pool,
    signal: controller.signal,
    configuration,
    report: (content) => process.stdout.write(`${content}\n`),
  });
  pool = undefined;
} catch {
  process.stderr.write("authentication email feedback worker failed\n");
  process.exitCode = 1;
  if (pool && !serviceOwnsPool) await pool.end().catch(() => undefined);
}
