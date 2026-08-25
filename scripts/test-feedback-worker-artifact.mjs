import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const temporary = mkdtempSync(join(tmpdir(), "astroligyapp-worker-artifact-"));
const archive = join(temporary, "source.tar");
const sources = [join(temporary, "source-a"), join(temporary, "source-b")];
const images = [
  "astroligyapp-feedback-worker:goal84-a",
  "astroligyapp-feedback-worker:goal84-b",
];
const ociArchives = [
  join(temporary, "a.oci.tar"),
  join(temporary, "b.oci.tar"),
];
const trivy =
  "aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969";
const shutdownContainer = `astroligyapp-feedback-worker-shutdown-${process.pid}`;

try {
  assert.equal(
    capture("git", ["status", "--porcelain", "--untracked-files=no"]).trim(),
    "",
    "tracked worktree must be clean",
  );
  const commit = capture("git", ["rev-parse", "HEAD"]).trim();
  const epoch = capture("git", ["show", "-s", "--format=%ct", "HEAD"]).trim();
  const created = new Date(Number(epoch) * 1_000).toISOString();
  run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"]);
  for (const source of sources) {
    run("powershell", [
      "-NoProfile",
      "-Command",
      `New-Item -ItemType Directory -Path '${source.replaceAll("'", "''")}' | Out-Null; tar -xf '${archive.replaceAll("'", "''")}' -C '${source.replaceAll("'", "''")}'`,
    ]);
  }
  for (let index = 0; index < images.length; index += 1) {
    run("docker", [
      "buildx",
      "build",
      "--no-cache",
      "--platform=linux/amd64",
      "--provenance=false",
      "--sbom=false",
      `--output=type=oci,dest=${ociArchives[index]},rewrite-timestamp=true`,
      "--file",
      join(sources[index], "Dockerfile.worker"),
      "--build-arg",
      `SOURCE_DATE_EPOCH=${epoch}`,
      "--build-arg",
      `SOURCE_REVISION=${commit}`,
      "--build-arg",
      `SOURCE_CREATED=${created}`,
      "--tag",
      images[index],
      sources[index],
    ]);
    run("docker", ["load", "--input", ociArchives[index]]);
  }

  const inspected = images.map(
    (image) => JSON.parse(capture("docker", ["image", "inspect", image]))[0],
  );
  assert.equal(
    inspected[0].Id,
    inspected[1].Id,
    "worker builds must reproduce",
  );
  assert.equal(inspected[0].Config.User, "nonroot");
  assert.equal(inspected[0].Config.ExposedPorts ?? null, null);
  assert.deepEqual(inspected[0].Config.Cmd, [
    "/usr/local/bin/node",
    "worker.mjs",
  ]);
  assert.deepEqual(inspected[0].Config.Healthcheck.Test, [
    "CMD",
    "/usr/local/bin/node",
    "health.mjs",
  ]);
  assert.equal(
    inspected[0].Config.Labels["org.opencontainers.image.revision"],
    commit,
  );
  assert.ok(
    inspected[0].Size < 100 * 1024 * 1024,
    "worker image exceeds 100 MiB",
  );

  const files = capture("docker", [
    "run",
    "--rm",
    "--read-only",
    "--network",
    "none",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    images[0],
    "/usr/local/bin/node",
    "-e",
    "const f=require('node:fs');const a=f.readdirSync('/app').sort();if(JSON.stringify(a)!=='[\\\"health.mjs\\\",\\\"worker.mjs\\\"]'||f.existsSync('/bin/sh')||f.existsSync('/usr/bin/npm'))process.exit(1)",
  ]);
  assert.equal(files, "");
  const failedStartup = run(
    "docker",
    [
      "run",
      "--rm",
      "--read-only",
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      images[0],
    ],
    { capture: true, tolerateFailure: true },
  );
  assert.equal(failedStartup.status, 1);
  assert.equal(failedStartup.stdout, "");
  assert.equal(
    failedStartup.stderr.trim(),
    "authentication email feedback worker failed",
  );

  const feedbackKey = createHash("sha256")
    .update("synthetic-artifact-shutdown-key")
    .digest("base64url");
  run("docker", [
    "run",
    "--detach",
    "--name",
    shutdownContainer,
    "--read-only",
    "--network",
    "none",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--env",
    "AWS_EC2_METADATA_DISABLED=true",
    "--env",
    "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI=/v2/credentials/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "--env",
    "AUTH_EMAIL_FEEDBACK_DATABASE_URL=postgresql://feedback:synthetic@postgres:5432/cosmic",
    "--env",
    "AUTH_EMAIL_FEEDBACK_DATABASE_ALLOW_INSECURE_LOCAL=true",
    "--env",
    `AUTH_EMAIL_FEEDBACK_KEYS=1:${feedbackKey}`,
    "--env",
    "SES_AUTH_EMAIL_REGION=ca-central-1",
    "--env",
    "SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL=https://sqs.ca-central-1.amazonaws.com/123456789012/synthetic-feedback",
    "--env",
    "SES_AUTH_EMAIL_FEEDBACK_TOPIC_ARN=arn:aws:sns:ca-central-1:123456789012:synthetic-feedback",
    "--env",
    "SES_AUTH_EMAIL_IDENTITY_ARN=arn:aws:ses:ca-central-1:123456789012:identity/example.invalid",
    "--env",
    "SES_AUTH_EMAIL_FROM=security@example.invalid",
    "--env",
    "SES_AUTH_EMAIL_CONFIGURATION_SET=authentication-events",
    images[0],
  ]);
  let healthy = false;
  for (let attempt = 0; attempt < 20 && !healthy; attempt += 1) {
    const health = run(
      "docker",
      ["exec", shutdownContainer, "/usr/local/bin/node", "health.mjs"],
      { capture: true, tolerateFailure: true },
    );
    healthy = health.status === 0;
    if (!healthy)
      run("powershell", [
        "-NoProfile",
        "-Command",
        "Start-Sleep -Milliseconds 250",
      ]);
  }
  assert.equal(healthy, true, "worker must reach its process-liveness check");
  const stopStarted = Date.now();
  run("docker", ["stop", "--time", "10", shutdownContainer]);
  assert.ok(
    Date.now() - stopStarted < 12_000,
    "SIGTERM shutdown exceeded 12 seconds",
  );
  const shutdownState = JSON.parse(
    capture("docker", ["inspect", shutdownContainer]),
  )[0].State;
  assert.equal(shutdownState.Running, false);
  assert.equal(shutdownState.ExitCode, 0, "SIGTERM must stop without SIGKILL");
  const shutdownLogs = run("docker", ["logs", shutdownContainer], {
    capture: true,
  });
  assert.equal(shutdownLogs.stderr, "");
  assert.doesNotMatch(
    shutdownLogs.stdout,
    /synthetic|credentials|postgres|sqs\.ca-central-1|security@example/u,
  );

  run("docker", [
    "run",
    "--rm",
    "--volume",
    "/var/run/docker.sock:/var/run/docker.sock",
    trivy,
    "image",
    "--scanners",
    "vuln,secret",
    "--severity",
    "HIGH,CRITICAL",
    "--exit-code",
    "1",
    "--quiet",
    images[0],
  ]);
  assert.match(
    readFileSync(join(sources[0], "Dockerfile.worker"), "utf8"),
    /USER nonroot[\s\S]*HEALTHCHECK[\s\S]*CMD/u,
  );
  console.log(
    `feedback worker artifact gate passed: ${inspected[0].Id}, ${inspected[0].Size} bytes`,
  );
} finally {
  run("docker", ["container", "rm", "--force", shutdownContainer], {
    capture: true,
    tolerateFailure: true,
  });
  for (const image of images)
    run("docker", ["image", "rm", "--force", image], {
      capture: true,
      tolerateFailure: true,
    });
  rmSync(temporary, { recursive: true, force: true });
}

function capture(command, arguments_) {
  return run(command, arguments_, { capture: true }).stdout;
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.tolerateFailure)
    throw new Error(
      `${command} ${arguments_.join(" ")} failed with ${result.status}${result.stderr ? `\n${result.stderr}` : ""}`,
    );
  return result;
}
