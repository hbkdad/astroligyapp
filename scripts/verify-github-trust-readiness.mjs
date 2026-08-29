import { readFileSync } from "node:fs";

import { validateTrustReadinessSnapshot } from "./lib/github-trust-readiness.mjs";

const policy = JSON.parse(
  readFileSync("config/github-protected-promotion-policy.json", "utf8"),
);
const snapshot = JSON.parse(
  readFileSync("docs/evidence/github-trust-readiness.snapshot.json", "utf8"),
);
const result = validateTrustReadinessSnapshot(snapshot, policy);
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 2;
