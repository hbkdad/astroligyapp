import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { summarizePublicStaticContentDiff } from "./lib/reproducibility-diagnostic.mjs";

const root = mkdtempSync(join(tmpdir(), "astroligyapp-repro-diagnostic-"));
const pathA = join(root, "a");
const pathB = join(root, "b");
const secret = "build-secret-that-must-never-enter-public-static-output";

try {
  writeFileSync(pathA, `prefix alpha ${"a".repeat(48)} common`);
  writeFileSync(pathB, `prefix beta ${"b".repeat(48)} common`);
  const summary = summarizePublicStaticContentDiff({
    path: "app/.next/server/app/index.rsc",
    pathA,
    pathB,
    secret,
  });
  assert.equal(summary.publicContentDiff.firstDifference, 7);
  assert.equal(summary.publicContentDiff.commonSuffixBytes, 7);
  assert.match(summary.publicContentDiff.excerptA, /redacted-token/u);
  assert.doesNotMatch(summary.publicContentDiff.excerptA, /a{40}/u);
  assert.deepEqual(
    summarizePublicStaticContentDiff({
      path: "app/server/private.json",
      pathA,
      pathB,
      secret,
    }),
    {},
  );
  writeFileSync(pathA, secret);
  assert.throws(() =>
    summarizePublicStaticContentDiff({
      path: "app/.next/server/app/timeline.html",
      pathA,
      pathB,
      secret,
    }),
  );
  writeFileSync(pathA, "authorization: bearer public-log-risk");
  assert.throws(() =>
    summarizePublicStaticContentDiff({
      path: "app/.next/server/app/timeline.rsc",
      pathA,
      pathB,
      secret,
    }),
  );
  console.log("reproducibility diagnostic contract passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
