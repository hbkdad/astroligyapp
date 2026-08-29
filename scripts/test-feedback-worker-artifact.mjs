import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  canonicalJson,
  extractDockerfileBaseImages,
  selectOciManifestDigest,
  sha256,
} from "./lib/artifact-manifest.mjs";
import { createWorkerSpdx } from "./lib/worker-sbom.mjs";
import {
  concludeLicenseEvidence,
  validateLicenseEvidenceBundle,
} from "./lib/license-evidence.mjs";
import { emptyDispositionSummary } from "./lib/license-disposition.mjs";

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
const dockerArchives = [
  join(temporary, "a.docker.tar"),
  join(temporary, "b.docker.tar"),
];
const trivy =
  "aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969";
const shutdownContainer = `astroligyapp-feedback-worker-shutdown-${process.pid}`;
const workerEvidenceDirectory = join(temporary, "worker-evidence");

try {
  assert.equal(
    capture("git", ["status", "--porcelain", "--untracked-files=no"]).trim(),
    "",
    "tracked worktree must be clean",
  );
  const commit = capture("git", ["rev-parse", "HEAD"]).trim();
  const tree = capture("git", ["rev-parse", "HEAD^{tree}"]).trim();
  const epoch = capture("git", ["show", "-s", "--format=%ct", "HEAD"]).trim();
  const created = new Date(Number(epoch) * 1_000).toISOString();
  run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"]);
  for (const source of sources) {
    mkdirSync(source);
    run("tar", ["-xf", archive, "-C", source]);
  }
  const dockerfile = readFileSync(
    join(sources[0], "Dockerfile.worker"),
    "utf8",
  );
  const baseImages = extractDockerfileBaseImages(dockerfile);
  for (let index = 0; index < images.length; index += 1) {
    run("docker", [
      "buildx",
      "build",
      "--no-cache",
      "--platform=linux/amd64",
      "--provenance=false",
      "--sbom=false",
      `--output=type=oci,dest=${ociArchives[index]},rewrite-timestamp=true`,
      `--output=type=docker,dest=${dockerArchives[index]},rewrite-timestamp=true`,
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
    run("docker", ["load", "--input", dockerArchives[index]]);
  }
  const imageDigests = ociArchives.map((ociArchive) =>
    selectOciManifestDigest(
      JSON.parse(capture("tar", ["-xOf", ociArchive, "index.json"])),
    ),
  );
  assert.equal(
    imageDigests[0],
    imageDigests[1],
    "OCI manifests must reproduce",
  );
  const ociManifest = JSON.parse(
    capture("tar", [
      "-xOf",
      ociArchives[0],
      `blobs/sha256/${imageDigests[0].slice(7)}`,
    ]),
  );
  const transportBytes = [ociManifest.config, ...ociManifest.layers].reduce(
    (total, descriptor) => total + descriptor.size,
    0,
  );
  run("docker", [
    "buildx",
    "build",
    "--platform=linux/amd64",
    "--provenance=false",
    "--sbom=false",
    "--target",
    "evidence",
    `--output=type=local,dest=${workerEvidenceDirectory}`,
    "--file",
    join(sources[0], "Dockerfile.worker"),
    "--build-arg",
    `SOURCE_DATE_EPOCH=${epoch}`,
    "--build-arg",
    `SOURCE_REVISION=${commit}`,
    "--build-arg",
    `SOURCE_CREATED=${created}`,
    sources[0],
  ]);

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
    transportBytes < 100 * 1024 * 1024,
    "worker OCI transport size exceeds 100 MiB",
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

  const bundle = readFileSync(join(workerEvidenceDirectory, "worker.mjs"));
  const bundleSha256 = sha256(bundle);
  const runtimeBundleSha256 = capture("docker", [
    "run",
    "--rm",
    "--read-only",
    "--network",
    "none",
    "--cap-drop",
    "ALL",
    images[0],
    "/usr/local/bin/node",
    "-e",
    "const c=require('node:crypto'),f=require('node:fs');process.stdout.write('sha256:'+c.createHash('sha256').update(f.readFileSync('/app/worker.mjs')).digest('hex'))",
  ]);
  assert.equal(
    runtimeBundleSha256,
    bundleSha256,
    "worker evidence must match the runtime bundle",
  );
  const workerSbom = createWorkerSpdx({
    commit,
    created,
    metafile: JSON.parse(
      readFileSync(join(workerEvidenceDirectory, "bundle-meta.json"), "utf8"),
    ),
    lockfile: JSON.parse(
      readFileSync(join(sources[0], "package-lock.json"), "utf8"),
    ),
    packageManifest: JSON.parse(
      readFileSync(join(sources[0], "package.json"), "utf8"),
    ),
    bundleSha256,
  });
  assert.equal(workerSbom.packageCount, 37);
  assert.equal(workerSbom.dependencyCount, 36);
  const reviewedMaterials = JSON.parse(
    readFileSync(
      join(sources[0], "config", "release-license-materials.json"),
      "utf8",
    ),
  );
  const workerLicenseEvidence = concludeLicenseEvidence({
    artifact: "feedback-worker",
    spdx: workerSbom.document,
    policy: JSON.parse(
      readFileSync(
        join(sources[0], "config", "release-license-policy.json"),
        "utf8",
      ),
    ),
    sourceRoot: process.cwd(),
    lockfile: JSON.parse(
      readFileSync(join(sources[0], "package-lock.json"), "utf8"),
    ),
    proprietaryText: readFileSync(join(sources[0], "LICENSE"), "utf8"),
    reviewedMaterials,
  });
  validateLicenseEvidenceBundle({
    evidence: workerLicenseEvidence.evidence,
    notice: workerLicenseEvidence.notice,
    policy: JSON.parse(
      readFileSync(
        join(sources[0], "config", "release-license-policy.json"),
        "utf8",
      ),
    ),
    reviewedMaterials,
    summary: workerLicenseEvidence.summary,
  });
  const workerSbomJson = canonicalJson(workerSbom.document);
  writeFileSync(
    join(workerEvidenceDirectory, "worker.spdx.json"),
    workerSbomJson,
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
    "SES_AUTH_EMAIL_FEEDBACK_QUEUE_URL=https://sqs.ca-central-1.amazonaws.com/123456789012/synthetic-email-feedback",
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
    if (!healthy) sleep(250);
  }
  assert.equal(healthy, true, "worker must reach its process-liveness check");
  const stopStarted = Date.now();
  run("docker", ["stop", "--timeout", "10", shutdownContainer]);
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
    `${workerEvidenceDirectory}:/evidence:ro`,
    trivy,
    "sbom",
    "--severity",
    "HIGH,CRITICAL",
    "--exit-code",
    "1",
    "--quiet",
    "/evidence/worker.spdx.json",
  ]);
  const sharedEvidence = process.env.RELEASE_EVIDENCE_DIRECTORY;
  if (sharedEvidence) {
    mkdirSync(sharedEvidence, { recursive: true });
    writeFileSync(
      join(sharedEvidence, "feedback-worker-artifact.json"),
      canonicalJson({
        source: { commit, tree, sourceDateEpoch: Number(epoch) },
        artifact: {
          name: "feedback-worker",
          repository: "astroligyapp-feedback-worker",
          baseImages,
          dockerfileSha256: sha256(dockerfile),
          imageId: inspected[0].Id,
          imageDigest: imageDigests[0],
          platform: "linux/amd64",
          reproducibleBuilds: 2,
          sbom: {
            format: "SPDX-2.3",
            sha256: workerSbom.sha256,
            packageCount: workerSbom.packageCount,
            unresolvedLicenseCount: 0,
          },
          licenses: { ...workerLicenseEvidence.summary },
          licenseDispositions: emptyDispositionSummary(
            workerLicenseEvidence.summary.manualReviewCount,
          ),
          scans: {
            imageSecrets: "pass",
            imageVulnerabilities: "pass",
          },
          rollbackPredecessor: null,
        },
      }),
    );
    writeFileSync(
      join(sharedEvidence, "feedback-worker.spdx.json"),
      workerSbom.json,
    );
    writeFileSync(
      join(sharedEvidence, "feedback-worker-license-evidence.json"),
      workerLicenseEvidence.evidenceJson,
    );
    writeFileSync(
      join(sharedEvidence, "feedback-worker-THIRD-PARTY-NOTICES.txt"),
      workerLicenseEvidence.notice,
    );
  }

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
    `feedback worker artifact gate passed: ${inspected[0].Id}, ${transportBytes} OCI transport bytes, ${workerSbom.dependencyCount} traced dependencies, ${workerLicenseEvidence.summary.unresolvedCount} unresolved license assertions, ${workerLicenseEvidence.summary.manualReviewCount} manual reviews`,
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

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
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
