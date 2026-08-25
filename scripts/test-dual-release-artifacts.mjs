import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  assertReleaseSetPromotionReferences,
  canonicalJson,
  createLocalSlsaStatement,
  sha256,
  validateReleaseSet,
} from "./lib/artifact-manifest.mjs";

const evidence = mkdtempSync(join(tmpdir(), "astroligyapp-release-set-"));
const cosign =
  "ghcr.io/sigstore/cosign/cosign@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8";
const tools = {
  cosign,
  gitleaks:
    "ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f",
  syft: "anchore/syft@sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0",
  trivy:
    "aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969",
};

try {
  assert.equal(
    capture("git", ["status", "--porcelain", "--untracked-files=no"]).trim(),
    "",
  );
  const environment = { ...process.env, RELEASE_EVIDENCE_DIRECTORY: evidence };
  run("node", ["scripts/test-release-artifact.mjs"], { environment });
  run("node", ["scripts/test-feedback-worker-artifact.mjs"], { environment });

  const application = readEvidence("application-artifact.json");
  const worker = readEvidence("feedback-worker-artifact.json");
  assert.deepEqual(
    application.source,
    worker.source,
    "artifact source revisions must match",
  );
  const releaseSet = {
    schemaVersion: 3,
    kind: "astroligyapp.release-set",
    statement: {
      source: {
        repository: "https://github.com/hbkdad/astroligyapp",
        ...application.source,
      },
      artifacts: [application.artifact, worker.artifact],
      tools,
    },
    localVerification: null,
  };
  validateReleaseSet(releaseSet, {
    commit: application.source.commit,
    imageIds: {
      application: application.artifact.imageId,
      "feedback-worker": worker.artifact.imageId,
    },
    imageDigests: {
      application: application.artifact.imageDigest,
      "feedback-worker": worker.artifact.imageDigest,
    },
  });
  assertReleaseSetPromotionReferences(releaseSet, {
    application: `123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp@${application.artifact.imageDigest}`,
    "feedback-worker": `123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp-feedback-worker@${worker.artifact.imageDigest}`,
  });

  const statementPath = join(evidence, "release-statement.json");
  const provenancePath = join(evidence, "provenance.slsa.json");
  writeFileSync(statementPath, canonicalJson(releaseSet.statement));
  const provenance = createLocalSlsaStatement(releaseSet);
  writeFileSync(provenancePath, canonicalJson(provenance));
  writeFileSync(
    join(evidence, "provenance-predicate.json"),
    canonicalJson(provenance.predicate),
  );
  const password = randomBytes(32).toString("base64url");
  const signingEnvironment = { COSIGN_PASSWORD: password };
  cosignRun(
    ["generate-key-pair", "--output-key-prefix", "/evidence/local"],
    signingEnvironment,
  );
  cosignRun([
    "signing-config",
    "create",
    "--out",
    "/evidence/offline-signing-config.json",
  ]);
  cosignRun(
    [
      "sign-blob",
      "--yes",
      "--signing-config",
      "/evidence/offline-signing-config.json",
      "--key",
      "/evidence/local.key",
      "--bundle",
      "/evidence/signature.sigstore.json",
      "/evidence/release-statement.json",
    ],
    signingEnvironment,
  );
  cosignRun(
    [
      "attest-blob",
      "--yes",
      "--signing-config",
      "/evidence/offline-signing-config.json",
      "--key",
      "/evidence/local.key",
      "--predicate",
      "/evidence/provenance-predicate.json",
      "--type",
      "slsaprovenance1",
      "--bundle",
      "/evidence/attestation.sigstore.json",
      "/evidence/release-statement.json",
    ],
    signingEnvironment,
  );
  verifyLocal(
    "verify-blob",
    "signature.sigstore.json",
    "release-statement.json",
  );
  verifyLocal(
    "verify-blob-attestation",
    "attestation.sigstore.json",
    "release-statement.json",
    ["--type", "slsaprovenance1"],
  );

  const tampered = `${readFileSync(statementPath, "utf8")} `;
  writeFileSync(join(evidence, "tampered-statement.json"), tampered);
  const rejected = cosignRun(
    [
      "verify-blob",
      "--insecure-ignore-tlog",
      "--key",
      "/evidence/local.pub",
      "--bundle",
      "/evidence/signature.sigstore.json",
      "/evidence/tampered-statement.json",
    ],
    {},
    { capture: true, tolerateFailure: true },
  );
  assert.notEqual(
    rejected.status,
    0,
    "tampered release statement must fail signature verification",
  );

  releaseSet.localVerification = {
    trust: "local-ephemeral-untrusted",
    publicKeySha256: sha256(readFileSync(join(evidence, "local.pub"))),
    signatureBundleSha256: sha256(
      readFileSync(join(evidence, "signature.sigstore.json")),
    ),
    attestationBundleSha256: sha256(
      readFileSync(join(evidence, "attestation.sigstore.json")),
    ),
  };
  validateReleaseSet(releaseSet);
  writeFileSync(join(evidence, "release-set.json"), canonicalJson(releaseSet));
  assert.doesNotMatch(
    readFileSync(join(evidence, "release-set.json"), "utf8"),
    new RegExp(password, "u"),
  );
  console.log(
    `dual-artifact release gate passed: ${application.artifact.imageDigest}, ${worker.artifact.imageDigest}`,
  );
} finally {
  rmSync(evidence, { recursive: true, force: true });
}

function readEvidence(name) {
  return JSON.parse(readFileSync(join(evidence, name), "utf8"));
}

function verifyLocal(command, bundle, blob, additional = []) {
  cosignRun([
    command,
    "--insecure-ignore-tlog",
    "--key",
    "/evidence/local.pub",
    "--bundle",
    `/evidence/${bundle}`,
    ...additional,
    `/evidence/${blob}`,
  ]);
}

function cosignRun(arguments_, environment = {}, options = {}) {
  return run(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--volume",
      `${evidence}:/evidence`,
      "--workdir",
      "/evidence",
      ...Object.keys(environment).flatMap((name) => ["--env", name]),
      cosign,
      ...arguments_,
    ],
    { ...options, environment: { ...process.env, ...environment } },
  );
}

function capture(command, arguments_) {
  return run(command, arguments_, { capture: true }).stdout;
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    env: options.environment ?? process.env,
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
