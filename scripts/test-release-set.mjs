import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertReleaseSetPromotionReferences,
  canonicalJson,
  createLocalSlsaStatement,
  sha256,
  validateReleaseSet,
} from "./lib/artifact-manifest.mjs";
import { createWorkerSpdx } from "./lib/worker-sbom.mjs";
import {
  assertExternalRedistributionReady,
  concludeLicenseEvidence,
  validateLicenseEvidenceBundle,
} from "./lib/license-evidence.mjs";

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const applicationImageId = `sha256:${"1".repeat(64)}`;
const workerImageId = `sha256:${"2".repeat(64)}`;
const applicationImage = `sha256:${"a".repeat(64)}`;
const workerImage = `sha256:${"c".repeat(64)}`;
const created = "2026-08-25T00:00:00.000Z";
const metafile = JSON.parse(
  readFileSync("dist/auth-email-feedback-worker/bundle-meta.json", "utf8"),
);
const bundle = readFileSync("dist/auth-email-feedback-worker/worker.mjs");
const workerSbom = createWorkerSpdx({
  commit,
  created,
  metafile,
  lockfile: JSON.parse(readFileSync("package-lock.json", "utf8")),
  packageManifest: JSON.parse(readFileSync("package.json", "utf8")),
  bundleSha256: sha256(bundle),
});
const policy = JSON.parse(
  readFileSync("config/release-license-policy.json", "utf8"),
);
const workerLicenseEvidence = concludeLicenseEvidence({
  artifact: "feedback-worker",
  spdx: workerSbom.document,
  policy,
  sourceRoot: process.cwd(),
  lockfile: JSON.parse(readFileSync("package-lock.json", "utf8")),
  proprietaryText: readFileSync("LICENSE", "utf8"),
});
assert.doesNotThrow(() =>
  validateLicenseEvidenceBundle({
    evidence: workerLicenseEvidence.evidence,
    notice: workerLicenseEvidence.notice,
    policy,
    summary: workerLicenseEvidence.summary,
  }),
);
for (const mutate of [
  (copy) => (copy.evidence.packages[1].identity.version = "tampered"),
  (copy) => (copy.evidence.packages[1].source = "https://example.invalid"),
  (copy) => (copy.evidence.packages[1].integrity = "tampered"),
  (copy) =>
    (copy.evidence.packages[1].licenseExpression = "MIT OR AGPL-3.0-only"),
  (copy) => (copy.evidence.packages[1].licenseText.text += "tampered"),
  (copy) => (copy.notice += "tampered"),
  (copy) => (copy.policy.policyVersion = "2026-08-25.2"),
]) {
  const copy = {
    evidence: structuredClone(workerLicenseEvidence.evidence),
    notice: workerLicenseEvidence.notice,
    policy: structuredClone(policy),
    summary: structuredClone(workerLicenseEvidence.summary),
  };
  mutate(copy);
  assert.throws(() => validateLicenseEvidenceBundle(copy));
}
assert.equal(workerSbom.packageCount, 37);
assert.equal(workerSbom.dependencyCount, 36);
assert.equal(workerSbom.bundledInputCount, 542);
assert.equal(
  workerSbom.document.packages[0].licenseDeclared,
  "LicenseRef-Proprietary",
);
assert.deepEqual(
  [
    ...new Set(
      workerSbom.document.packages
        .slice(1)
        .map((package_) => package_.licenseDeclared),
    ),
  ].sort(),
  ["Apache-2.0", "ISC", "MIT"],
);
assert.doesNotMatch(
  workerSbom.json,
  /AUTH_EMAIL_FEEDBACK_KEYS|private@|receiptHandle/u,
);

const releaseSet = {
  schemaVersion: 3,
  kind: "astroligyapp.release-set",
  statement: {
    source: {
      repository: "https://github.com/hbkdad/astroligyapp",
      commit,
      tree,
      sourceDateEpoch: 1_787_630_000,
    },
    artifacts: [
      artifact(
        "application",
        applicationImageId,
        applicationImage,
        `sha256:${"3".repeat(64)}`,
        101,
      ),
      artifact(
        "feedback-worker",
        workerImageId,
        workerImage,
        `sha256:${"4".repeat(64)}`,
        workerSbom.packageCount,
      ),
    ],
    tools: {
      cosign: `ghcr.io/sigstore/cosign/cosign@sha256:${"5".repeat(64)}`,
      syft: `anchore/syft@sha256:${"6".repeat(64)}`,
      trivy: `aquasec/trivy@sha256:${"7".repeat(64)}`,
    },
  },
  localVerification: null,
};
validateReleaseSet(releaseSet, {
  commit,
  imageIds: {
    application: applicationImageId,
    "feedback-worker": workerImageId,
  },
  imageDigests: {
    application: applicationImage,
    "feedback-worker": workerImage,
  },
});
const promotionReferences = {
  application: `123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp@${applicationImage}`,
  "feedback-worker": `123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp-feedback-worker@${workerImage}`,
};
assert.throws(() =>
  assertReleaseSetPromotionReferences(releaseSet, promotionReferences),
);
const licenseReadyReleaseSet = structuredClone(releaseSet);
for (const artifact_ of licenseReadyReleaseSet.statement.artifacts) {
  artifact_.licenses.permittedWithNoticeCount =
    artifact_.licenses.packageCount - artifact_.licenses.firstPartyCount;
  artifact_.licenses.manualReviewCount = 0;
  artifact_.licenses.prohibitedCount = 0;
  artifact_.licenses.unresolvedCount = 0;
  artifact_.sbom.unresolvedLicenseCount = 0;
}
assert.doesNotThrow(() =>
  assertReleaseSetPromotionReferences(
    licenseReadyReleaseSet,
    promotionReferences,
  ),
);
assert.throws(() =>
  assertExternalRedistributionReady(workerLicenseEvidence.summary),
);
assert.doesNotThrow(() =>
  assertExternalRedistributionReady({
    ...workerLicenseEvidence.summary,
    permittedWithNoticeCount:
      workerLicenseEvidence.summary.permittedWithNoticeCount +
      workerLicenseEvidence.summary.manualReviewCount,
    manualReviewCount: 0,
  }),
);
const slsa = createLocalSlsaStatement(releaseSet);
assert.deepEqual(
  slsa.subject.map((subject) => subject.digest.sha256),
  [applicationImage.slice(7), workerImage.slice(7)],
);
assert.equal(slsa.predicate.buildDefinition.resolvedDependencies.length, 3);
assert.doesNotMatch(canonicalJson(slsa), /secret|passphrase|private.key/iu);

const independentRollback = structuredClone(releaseSet);
independentRollback.statement.artifacts[0].rollbackPredecessor = `sha256:${"8".repeat(64)}`;
assert.doesNotThrow(() => validateReleaseSet(independentRollback));

for (const mutate of [
  (copy) => copy.statement.artifacts.pop(),
  (copy) => (copy.statement.artifacts[1].imageDigest = applicationImage),
  (copy) => (copy.statement.artifacts[1].imageId = applicationImageId),
  (copy) => (copy.statement.artifacts[1].sbom.sha256 = "tampered"),
  (copy) =>
    (copy.statement.artifacts[0].rollbackPredecessor = applicationImage),
  (copy) => (copy.statement.source.commit = "mixed-revision"),
  (copy) => (copy.localVerification = { trust: "production" }),
  (copy) => (copy.statement.artifacts[0].licenses.noticeSha256 = "tampered"),
]) {
  const copy = structuredClone(releaseSet);
  mutate(copy);
  assert.throws(() => validateReleaseSet(copy, { commit }));
}
for (const references of [
  {
    application: "example.invalid/astroligyapp:latest",
    "feedback-worker": `123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp-feedback-worker@${workerImage}`,
  },
  {
    application: `123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp@${workerImage}`,
    "feedback-worker": `123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp-feedback-worker@${workerImage}`,
  },
]) {
  assert.throws(() =>
    assertReleaseSetPromotionReferences(releaseSet, references),
  );
}

console.log(
  `dual-artifact release contract passed (${workerSbom.dependencyCount} traced worker dependencies)`,
);

function artifact(name, imageId, imageDigest, dockerfileSha256, packageCount) {
  return {
    name,
    repository:
      name === "application" ? "astroligyapp" : "astroligyapp-feedback-worker",
    dockerfileSha256,
    baseImages: {
      build: `node:24.15.0-bookworm-slim@sha256:${"d".repeat(64)}`,
      runtime: `gcr.io/distroless/base-nossl-debian13@sha256:${"e".repeat(64)}`,
    },
    imageId,
    imageDigest,
    platform: "linux/amd64",
    reproducibleBuilds: 2,
    sbom: {
      format: "SPDX-2.3",
      sha256:
        name === "application" ? `sha256:${"9".repeat(64)}` : workerSbom.sha256,
      packageCount,
      unresolvedLicenseCount: name === "application" ? 101 : 0,
    },
    licenses:
      name === "feedback-worker"
        ? workerLicenseEvidence.summary
        : {
            ...workerLicenseEvidence.summary,
            packageCount,
            permittedWithNoticeCount: 90,
            manualReviewCount: 10,
            firstPartyCount: 1,
            unresolvedCount: 101,
          },
    scans: { imageSecrets: "pass", imageVulnerabilities: "pass" },
    rollbackPredecessor: null,
  };
}
