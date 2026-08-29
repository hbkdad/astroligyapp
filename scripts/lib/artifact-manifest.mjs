import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const TREE = /^[a-f0-9]{40}$/u;

export function validateArtifactManifest(manifest, expected = {}) {
  assert.equal(
    manifest.schemaVersion,
    3,
    "unsupported artifact manifest schema",
  );
  assert.equal(
    manifest.kind,
    "astroligyapp.release-evidence",
    "unexpected artifact manifest kind",
  );
  assert.match(manifest.source.commit, COMMIT, "invalid source commit");
  assert.match(manifest.source.tree, TREE, "invalid source tree");
  assert.match(
    manifest.source.dockerfileSha256,
    SHA256,
    "invalid Dockerfile digest",
  );
  assert.match(manifest.subject.imageId, SHA256, "invalid image ID");
  assert.equal(
    manifest.subject.platform,
    "linux/amd64",
    "unexpected image platform",
  );
  assert.equal(
    manifest.subject.reproducibleBuilds,
    2,
    "two independent builds are required",
  );
  assert.match(manifest.sbom.sha256, SHA256, "invalid SBOM digest");
  assert.equal(manifest.sbom.format, "SPDX-2.3", "unexpected SBOM format");
  assert.ok(
    Number.isInteger(manifest.sbom.packageCount) &&
      manifest.sbom.packageCount > 0,
    "SBOM must contain packages",
  );
  assert.ok(
    Number.isInteger(manifest.sbom.unresolvedLicenseCount) &&
      manifest.sbom.unresolvedLicenseCount >= 0,
    "invalid unresolved license count",
  );
  assert.equal(
    manifest.applicationLicense,
    "UNLICENSED",
    "application license declaration drifted",
  );
  assertLicenseSummary(manifest.licenses);
  assertLicenseDispositionSummary(
    manifest.licenseDispositions,
    manifest.licenses.manualReviewCount,
  );
  assert.deepEqual(
    manifest.scans,
    { gitSecrets: "pass", imageSecrets: "pass", imageVulnerabilities: "pass" },
    "required scans did not pass",
  );
  assert.equal(manifest.signature, null, "local evidence must remain unsigned");
  assert.equal(
    manifest.attestation,
    null,
    "local evidence must not claim an attestation",
  );
  assert.deepEqual(
    Object.keys(manifest.tools).sort(),
    ["cosign", "gitleaks", "syft", "trivy"],
    "tool inventory drifted",
  );
  for (const reference of Object.values(manifest.tools))
    assert.match(
      reference,
      /@sha256:[a-f0-9]{64}$/u,
      "tool must be digest pinned",
    );
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /(server.actions|encryption.key|passphrase|secret.value)/iu,
    "evidence includes forbidden secret material",
  );

  if (expected.commit)
    assert.equal(
      manifest.source.commit,
      expected.commit,
      "source commit mismatch",
    );
  if (expected.tree)
    assert.equal(manifest.source.tree, expected.tree, "source tree mismatch");
  if (expected.imageId)
    assert.equal(
      manifest.subject.imageId,
      expected.imageId,
      "image identity mismatch",
    );
  if (expected.sbomSha256)
    assert.equal(
      manifest.sbom.sha256,
      expected.sbomSha256,
      "SBOM identity mismatch",
    );
  return manifest;
}

export function assertImmutablePromotionReference(reference) {
  assert.match(
    reference,
    /^[a-z0-9][a-z0-9./_-]+@sha256:[a-f0-9]{64}$/u,
    "promotion reference must use an immutable sha256 digest",
  );
}

export function selectOciManifestDigest(index) {
  assert.equal(index.schemaVersion, 2, "OCI index schema must be 2");
  const manifests = index.manifests?.filter(
    (descriptor) =>
      descriptor.mediaType === "application/vnd.oci.image.manifest.v1+json",
  );
  assert.equal(
    manifests?.length,
    1,
    "OCI archive must contain one image manifest",
  );
  assert.equal(manifests[0].platform?.os, "linux");
  assert.equal(manifests[0].platform?.architecture, "amd64");
  assert.match(manifests[0].digest, SHA256);
  return manifests[0].digest;
}

export function extractDockerfileBaseImages(dockerfile) {
  const values = Object.fromEntries(
    [...dockerfile.matchAll(/^ARG (NODE_IMAGE|RUNTIME_IMAGE)=(\S+)$/gmu)].map(
      ([, name, reference]) => [name, reference],
    ),
  );
  assert.deepEqual(Object.keys(values).sort(), ["NODE_IMAGE", "RUNTIME_IMAGE"]);
  assertPinnedImageReference(values.NODE_IMAGE);
  assertPinnedImageReference(values.RUNTIME_IMAGE);
  return Object.freeze({
    build: values.NODE_IMAGE,
    runtime: values.RUNTIME_IMAGE,
  });
}

export function validateReleaseSet(envelope, expected = {}) {
  assert.deepEqual(
    Object.keys(envelope).sort(),
    ["kind", "localVerification", "schemaVersion", "statement"],
    "release-set envelope fields drifted",
  );
  assert.equal(envelope.schemaVersion, 4, "unsupported release-set schema");
  assert.equal(
    envelope.kind,
    "astroligyapp.release-set",
    "unexpected release-set kind",
  );
  const statement = envelope.statement;
  assert.deepEqual(
    Object.keys(statement).sort(),
    ["artifacts", "source", "tools"],
    "release-set statement fields drifted",
  );
  assert.match(statement.source.commit, COMMIT);
  assert.match(statement.source.tree, TREE);
  assert.equal(
    statement.source.repository,
    "https://github.com/hbkdad/astroligyapp",
  );
  assert.ok(Number.isSafeInteger(statement.source.sourceDateEpoch));
  assert.deepEqual(
    statement.artifacts.map((artifact) => artifact.name),
    ["application", "feedback-worker"],
    "both ordered release artifacts are required",
  );
  const imageIds = new Set();
  const imageDigests = new Set();
  for (const artifact of statement.artifacts) {
    assert.deepEqual(
      Object.keys(artifact).sort(),
      [
        "baseImages",
        "dockerfileSha256",
        "imageDigest",
        "imageId",
        "licenseDispositions",
        "licenses",
        "name",
        "platform",
        "repository",
        "reproducibleBuilds",
        "rollbackPredecessor",
        "sbom",
        "scans",
      ],
      `artifact fields drifted: ${artifact.name}`,
    );
    assert.deepEqual(Object.keys(artifact.baseImages).sort(), [
      "build",
      "runtime",
    ]);
    assertPinnedImageReference(artifact.baseImages.build);
    assertPinnedImageReference(artifact.baseImages.runtime);
    assert.match(artifact.dockerfileSha256, SHA256);
    assert.match(artifact.imageDigest, SHA256);
    assert.match(artifact.imageId, SHA256);
    assert.equal(artifact.platform, "linux/amd64");
    assert.equal(artifact.reproducibleBuilds, 2);
    assertLicenseSummary(artifact.licenses);
    assertLicenseDispositionSummary(
      artifact.licenseDispositions,
      artifact.licenses.manualReviewCount,
    );
    assert.equal(
      artifact.licenses.packageCount,
      artifact.sbom.packageCount,
      "license evidence and SBOM package counts differ",
    );
    assert.equal(
      artifact.licenses.unresolvedCount,
      artifact.sbom.unresolvedLicenseCount,
      "license evidence and SBOM unresolved counts differ",
    );
    assert.equal(
      artifact.repository,
      artifact.name === "application"
        ? "astroligyapp"
        : "astroligyapp-feedback-worker",
    );
    assert.equal(artifact.sbom.format, "SPDX-2.3");
    assert.deepEqual(Object.keys(artifact.sbom).sort(), [
      "format",
      "packageCount",
      "sha256",
      "unresolvedLicenseCount",
    ]);
    assert.match(artifact.sbom.sha256, SHA256);
    assert.ok(
      Number.isSafeInteger(artifact.sbom.packageCount) &&
        artifact.sbom.packageCount > 0,
    );
    assert.ok(
      Number.isSafeInteger(artifact.sbom.unresolvedLicenseCount) &&
        artifact.sbom.unresolvedLicenseCount >= 0,
    );
    assert.deepEqual(artifact.scans, {
      imageSecrets: "pass",
      imageVulnerabilities: "pass",
    });
    assert.ok(
      artifact.rollbackPredecessor === null ||
        SHA256.test(artifact.rollbackPredecessor),
    );
    assert.notEqual(
      artifact.rollbackPredecessor,
      artifact.imageDigest,
      "rollback predecessor must differ",
    );
    imageIds.add(artifact.imageId);
    imageDigests.add(artifact.imageDigest);
  }
  assert.equal(
    imageIds.size,
    2,
    "release artifacts must have distinct configuration identities",
  );
  assert.equal(
    imageDigests.size,
    2,
    "release artifacts must have distinct OCI manifest identities",
  );
  for (const reference of Object.values(statement.tools))
    assert.match(reference, /@sha256:[a-f0-9]{64}$/u);
  if (envelope.localVerification !== null) {
    assert.deepEqual(Object.keys(envelope.localVerification).sort(), [
      "attestationBundleSha256",
      "publicKeySha256",
      "signatureBundleSha256",
      "trust",
    ]);
    assert.equal(envelope.localVerification.trust, "local-ephemeral-untrusted");
    assert.match(envelope.localVerification.publicKeySha256, SHA256);
    assert.match(envelope.localVerification.signatureBundleSha256, SHA256);
    assert.match(envelope.localVerification.attestationBundleSha256, SHA256);
  }
  assert.doesNotMatch(
    JSON.stringify(envelope),
    /(encryption.key|passphrase|secret.value|private.key)/iu,
  );
  if (expected.commit) assert.equal(statement.source.commit, expected.commit);
  for (const [name, imageId] of Object.entries(expected.imageIds ?? {}))
    assert.equal(
      statement.artifacts.find((artifact) => artifact.name === name)?.imageId,
      imageId,
      `${name} image identity mismatch`,
    );
  for (const [name, imageDigest] of Object.entries(expected.imageDigests ?? {}))
    assert.equal(
      statement.artifacts.find((artifact) => artifact.name === name)
        ?.imageDigest,
      imageDigest,
      `${name} OCI manifest digest mismatch`,
    );
  return envelope;
}

export function assertReleaseSetPromotionReferences(
  envelope,
  references,
  verifiedDispositionLedgerHashes = {},
) {
  validateReleaseSet(envelope);
  assert.deepEqual(Object.keys(references).sort(), [
    "application",
    "feedback-worker",
  ]);
  for (const artifact of envelope.statement.artifacts) {
    assert.equal(
      artifact.licenses.unresolvedCount,
      0,
      `${artifact.name} has unresolved license assertions`,
    );
    assert.equal(
      artifact.licenses.prohibitedCount,
      0,
      `${artifact.name} is prohibited from redistribution`,
    );
    if (artifact.licenses.manualReviewCount > 0) {
      assert.equal(
        artifact.licenseDispositions.trust,
        "accountable-human",
        `${artifact.name} lacks accountable license dispositions`,
      );
      assert.equal(
        artifact.licenseDispositions.undisposedCount,
        0,
        `${artifact.name} has undisposed license reviews`,
      );
      assert.equal(
        artifact.licenseDispositions.rejectedCount,
        0,
        `${artifact.name} has rejected license dispositions`,
      );
      assert.equal(
        artifact.licenseDispositions.needsRemediationCount,
        0,
        `${artifact.name} has license remediation outstanding`,
      );
      assert.equal(
        verifiedDispositionLedgerHashes[artifact.name],
        artifact.licenseDispositions.ledgerSha256,
        `${artifact.name} disposition ledger was not verified with its evidence`,
      );
    }
    const reference = references[artifact.name];
    assertImmutablePromotionReference(reference);
    assert.match(
      reference,
      new RegExp(
        `^[0-9]{12}\\.dkr\\.ecr\\.ca-central-1\\.amazonaws\\.com/${artifact.repository}@${artifact.imageDigest}$`,
        "u",
      ),
      `${artifact.name} promotion subject mismatch`,
    );
  }
}

export function createLocalSlsaStatement(releaseSet) {
  validateReleaseSet(releaseSet);
  const statement = releaseSet.statement;
  return sortRecursively({
    _type: "https://in-toto.io/Statement/v1",
    subject: statement.artifacts.map((artifact) => ({
      name: artifact.repository,
      digest: { sha256: artifact.imageDigest.slice(7) },
    })),
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        buildType:
          "https://github.com/hbkdad/astroligyapp/build-types/local-dual-oci/v1",
        externalParameters: {
          repository: statement.source.repository,
          commit: statement.source.commit,
          platform: "linux/amd64",
        },
        resolvedDependencies: [
          {
            uri: `${statement.source.repository}.git`,
            digest: {
              gitCommit: statement.source.commit,
              gitTree: statement.source.tree,
            },
          },
          ...statement.artifacts.map((artifact) => ({
            uri: `${statement.source.repository}/blob/${statement.source.commit}/${artifact.name === "application" ? "Dockerfile" : "Dockerfile.worker"}`,
            digest: { sha256: artifact.dockerfileSha256.slice(7) },
          })),
        ],
      },
      runDetails: {
        builder: {
          id: "https://github.com/hbkdad/astroligyapp/builders/local-untrusted/v1",
        },
        metadata: {},
      },
    },
  });
}

export function normalizeSpdx(sbom, { commit, created, imageId }) {
  assert.equal(sbom.spdxVersion, "SPDX-2.3", "Syft must produce SPDX 2.3");
  assert.ok(
    Array.isArray(sbom.packages) && sbom.packages.length > 0,
    "SPDX document contains no packages",
  );
  for (const package_ of sbom.packages) {
    assert.ok(
      "licenseDeclared" in package_,
      `package ${package_.name ?? "unknown"} has no license declaration`,
    );
    assert.ok(
      "licenseConcluded" in package_,
      `package ${package_.name ?? "unknown"} has no concluded license`,
    );
  }
  sbom.name = `astroligyapp-${imageId.slice(7, 19)}`;
  sbom.documentNamespace = `https://github.com/hbkdad/astroligyapp/sbom/${commit}/${imageId.slice(7)}`;
  sbom.creationInfo = { ...sbom.creationInfo, created };
  sbom.packages.sort((left, right) => left.SPDXID.localeCompare(right.SPDXID));
  sbom.relationships?.sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)),
  );
  return sortRecursively(sbom);
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortRecursively(value), null, 2)}\n`;
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortRecursively(value[key])]),
    );
  }
  return value;
}

function assertPinnedImageReference(reference) {
  assert.match(
    reference,
    /^[a-z0-9][a-z0-9./_:-]+@sha256:[a-f0-9]{64}$/u,
    "base image must use a pinned sha256 digest",
  );
}

function assertLicenseSummary(summary) {
  assert.deepEqual(Object.keys(summary).sort(), [
    "evidenceSha256",
    "firstPartyCount",
    "manualReviewCount",
    "materialsSha256",
    "materialsVersion",
    "noticeSha256",
    "packageCount",
    "permittedWithNoticeCount",
    "policySha256",
    "policyVersion",
    "prohibitedCount",
    "unresolvedCount",
  ]);
  assert.match(summary.policyVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  if (summary.materialsVersion !== null)
    assert.match(summary.materialsVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  if (summary.materialsSha256 !== null)
    assert.match(summary.materialsSha256, SHA256);
  assert.equal(
    summary.materialsVersion === null,
    summary.materialsSha256 === null,
  );
  for (const field of ["evidenceSha256", "noticeSha256", "policySha256"])
    assert.match(summary[field], SHA256);
  for (const field of [
    "packageCount",
    "permittedWithNoticeCount",
    "manualReviewCount",
    "prohibitedCount",
    "firstPartyCount",
    "unresolvedCount",
  ])
    assert.ok(Number.isSafeInteger(summary[field]) && summary[field] >= 0);
  assert.equal(
    summary.packageCount,
    summary.permittedWithNoticeCount +
      summary.manualReviewCount +
      summary.prohibitedCount +
      summary.firstPartyCount,
  );
}

function assertLicenseDispositionSummary(summary, manualReviewCount) {
  assert.deepEqual(Object.keys(summary).sort(), [
    "approvedCount",
    "dispositionCount",
    "ledgerSha256",
    "needsRemediationCount",
    "rejectedCount",
    "trust",
    "undisposedCount",
  ]);
  assert.ok(
    ["none", "synthetic-fixture-only", "accountable-human"].includes(
      summary.trust,
    ),
  );
  assert.ok(summary.ledgerSha256 === null || SHA256.test(summary.ledgerSha256));
  for (const field of [
    "dispositionCount",
    "approvedCount",
    "rejectedCount",
    "needsRemediationCount",
    "undisposedCount",
  ])
    assert.ok(Number.isSafeInteger(summary[field]) && summary[field] >= 0);
  assert.equal(
    summary.dispositionCount,
    summary.approvedCount +
      summary.rejectedCount +
      summary.needsRemediationCount,
  );
  assert.equal(
    summary.dispositionCount + summary.undisposedCount,
    manualReviewCount,
  );
  if (summary.trust === "none") assert.equal(summary.ledgerSha256, null);
  else assert.match(summary.ledgerSha256, SHA256);
  if (manualReviewCount === 0) {
    assert.equal(summary.trust, "none");
    assert.equal(summary.dispositionCount, 0);
  }
}
