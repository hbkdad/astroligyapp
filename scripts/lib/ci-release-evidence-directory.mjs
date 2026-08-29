import assert from "node:assert/strict";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { validateCiReleaseEvidence } from "./ci-release-evidence.mjs";

export function verifyCiReleaseEvidenceDirectory({
  directory,
  policy,
  workflowText,
  now,
  seenRunKeys = new Set(),
}) {
  const evidenceDirectory = resolve(directory);
  const expected = [
    "ci-release-evidence.json",
    ...policy.requiredEvidenceFiles,
  ].sort();
  const actual = readdirSync(evidenceDirectory).sort();
  assert.deepEqual(
    actual,
    expected,
    "unexpected CI evidence directory contents",
  );
  for (const name of actual) {
    const status = lstatSync(join(evidenceDirectory, name));
    assert.ok(
      status.isFile(),
      `CI evidence entry is not a regular file: ${name}`,
    );
    assert.ok(!status.isSymbolicLink(), `CI evidence entry is a link: ${name}`);
  }
  const evidenceFiles = Object.fromEntries(
    policy.requiredEvidenceFiles.map((name) => [
      name,
      readFileSync(join(evidenceDirectory, name)),
    ]),
  );
  const envelope = JSON.parse(
    readFileSync(join(evidenceDirectory, "ci-release-evidence.json"), "utf8"),
  );
  const releaseSet = JSON.parse(
    evidenceFiles["release-set.json"].toString("utf8"),
  );
  validateCiReleaseEvidence({
    envelope,
    policy,
    workflowText,
    evidenceFiles,
    releaseSet,
    now,
    seenRunKeys,
  });
  return envelope;
}
