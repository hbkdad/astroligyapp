import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { verifyCiReleaseEvidenceDirectory } from "./lib/ci-release-evidence-directory.mjs";

const root = process.cwd();
assert.equal(
  process.argv.length,
  3,
  "usage: npm run ci:release:verify -- <evidence-directory>",
);
const policy = JSON.parse(
  readFileSync(join(root, "config", "release-ci-policy.json"), "utf8"),
);
const workflowText = readFileSync(join(root, policy.workflow.path), "utf8");
const seenRunKeys = new Set(
  (process.env.CI_RELEASE_SEEN_RUN_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean),
);
const now = new Date().toISOString().replace(/\.\d{3}Z$/u, ".000Z");
const envelope = verifyCiReleaseEvidenceDirectory({
  directory: resolve(process.argv[2]),
  policy,
  workflowText,
  now,
  seenRunKeys,
});
console.log(
  `Verified credential-free CI evidence for ${envelope.identity.commit} from run ${envelope.identity.runKey}; promotion remains unauthorized`,
);
