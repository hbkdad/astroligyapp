import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "./lib/artifact-manifest.mjs";
import {
  createCredentialFreeStagingPackage,
  validateStagingApprovalPackage,
} from "./lib/staging-approval.mjs";

const fixturePath = fileURLToPath(
  new URL("../infra/aws/approval/staging-review.fixture.json", import.meta.url),
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const envelope = createCredentialFreeStagingPackage(fixture);
validateStagingApprovalPackage(envelope, {
  now: new Date(fixture.generatedAt),
});
process.stdout.write(canonicalJson(envelope));
