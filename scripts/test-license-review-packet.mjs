import assert from "node:assert/strict";

import { canonicalJson, sha256 } from "./lib/artifact-manifest.mjs";
import {
  assertLicenseReviewAuthorizesRedistribution,
  createLicenseReviewPacket,
  validateLicenseReviewPacket,
} from "./lib/license-review-packet.mjs";

const source = {
  repository: "https://github.com/hbkdad/astroligyapp",
  commit: "a".repeat(40),
  tree: "b".repeat(40),
  sourceDateEpoch: 1_788_019_200,
};
const evidenceByArtifact = {
  application: evidence("application", [
    manual(
      "SPDXRef-node",
      "node",
      "NOASSERTION",
      "missing or unparseable license assertion",
      null,
    ),
    manual(
      "SPDXRef-libc",
      "libc6",
      "LicenseRef-GPL",
      "custom license reference",
      `sha256:${"1".repeat(64)}`,
    ),
  ]),
  "feedback-worker": evidence("feedback-worker", [
    manual(
      "SPDXRef-pg",
      "pg-types",
      "MIT",
      "authoritative license text is unavailable",
      null,
    ),
  ]),
};
const releaseSet = {
  schemaVersion: 4,
  kind: "astroligyapp.release-set",
  statement: {
    source,
    artifacts: Object.entries(evidenceByArtifact).map(([name, evidence_]) => ({
      name,
      licenses: summary(evidence_),
    })),
    tools: {},
  },
  localVerification: null,
};
const createdAt = "2026-08-29T00:00:00.000Z";
const validUntil = "2026-09-28T00:00:00.000Z";
const packet = createLicenseReviewPacket({
  releaseSet,
  evidenceByArtifact,
  createdAt,
  validUntil,
});
const options = { releaseSet, evidenceByArtifact, now: createdAt };
validateLicenseReviewPacket(packet, options);
assert.equal(
  canonicalJson(
    createLicenseReviewPacket({
      releaseSet,
      evidenceByArtifact,
      createdAt,
      validUntil,
    }),
  ),
  canonicalJson(packet),
);
assert.throws(() =>
  assertLicenseReviewAuthorizesRedistribution(packet, options),
);
assert.deepEqual(
  packet.statement.artifacts
    .flatMap((artifact) => artifact.records)
    .map((record) => record.category),
  [
    "custom-or-composite-terms",
    "missing-assertion",
    "missing-authoritative-text",
  ],
);

let rejected = 0;
for (const mutate of [
  (copy) => (copy.statement.source.commit = "f".repeat(40)),
  (copy) => (copy.statement.releaseSetSha256 = `sha256:${"0".repeat(64)}`),
  (copy) => copy.statement.artifacts.pop(),
  (copy) => copy.statement.artifacts[0].records.pop(),
  (copy) =>
    copy.statement.artifacts[0].records.push(
      structuredClone(copy.statement.artifacts[0].records[0]),
    ),
  (copy) => (copy.statement.artifacts[0].records[0].licenseExpression = "MIT"),
  (copy) =>
    (copy.statement.artifacts[0].records[0].packageSource =
      "https://example.invalid/latest"),
  (copy) =>
    (copy.statement.artifacts[0].policySha256 = `sha256:${"0".repeat(64)}`),
  (copy) => (copy.statement.artifacts[0].materialsVersion = "2026-09-01.1"),
  (copy) => (copy.review.status = "approved"),
  (copy) => (copy.review.authorizationGranted = true),
  (copy) => copy.review.decisions.push({ decision: "approved" }),
  (copy) => (copy.trust = "accountable-human"),
  (copy) =>
    (copy.statement.reviewRequirements.roles[1] =
      copy.statement.reviewRequirements.roles[0]),
  (copy) => copy.statement.reviewRequirements.reReviewTriggers.pop(),
  (copy) => (copy.privateKey = "BEGIN PRIVATE KEY"),
]) {
  const copy = structuredClone(packet);
  mutate(copy);
  if (!("privateKey" in copy))
    copy.scopeSha256 = sha256(canonicalJson(copy.statement));
  assert.throws(() => validateLicenseReviewPacket(copy, options));
  rejected += 1;
}
assert.throws(() =>
  validateLicenseReviewPacket(packet, {
    ...options,
    now: "2026-09-28T00:00:00.000Z",
  }),
);
rejected += 1;

console.log(
  `license review packet contract passed (3 synthetic blockers, ${rejected} unsafe cases rejected)`,
);

function manual(spdxId, name, licenseExpression, reason, textHash) {
  return {
    spdxId,
    name,
    observedVersion: "1.0.0",
    source: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
    integrity: `sha512-${name}`,
    licenseExpression,
    licenseText: textHash ? { sha256: textHash } : null,
    decision: { outcome: "manual-review", reason },
  };
}

function evidence(artifact, packages) {
  return {
    schemaVersion: 2,
    kind: "astroligyapp.license-evidence",
    artifact,
    policyVersion: "2026-08-25.1",
    policySha256: `sha256:${"2".repeat(64)}`,
    materialsVersion: "2026-08-29.2",
    materialsSha256: `sha256:${"3".repeat(64)}`,
    counts: {},
    packages,
  };
}

function summary(evidence_) {
  const manualReviewCount = evidence_.packages.length;
  return {
    policyVersion: evidence_.policyVersion,
    policySha256: evidence_.policySha256,
    materialsVersion: evidence_.materialsVersion,
    materialsSha256: evidence_.materialsSha256,
    evidenceSha256: sha256(canonicalJson(evidence_)),
    noticeSha256: `sha256:${"4".repeat(64)}`,
    packageCount: manualReviewCount,
    permittedWithNoticeCount: 0,
    manualReviewCount,
    prohibitedCount: 0,
    firstPartyCount: 0,
    unresolvedCount: evidence_.packages.filter(
      (package_) => package_.licenseExpression === "NOASSERTION",
    ).length,
  };
}
