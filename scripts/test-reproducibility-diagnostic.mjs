import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { summarizePublicStaticContentDiff } from "./lib/reproducibility-diagnostic.mjs";
import {
  canonicalizeClientReferenceManifest,
  serializeEdgeServerReferenceManifest,
  sortManifestRecord,
  sortManifestValue,
} from "./lib/next-build-normalization.mjs";

const root = mkdtempSync(join(tmpdir(), "astroligyapp-repro-diagnostic-"));
const pathA = join(root, "a");
const pathB = join(root, "b");
const secret = "build-secret-that-must-never-enter-public-static-output";

try {
  const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const normalizer = readFileSync("scripts/normalize-next-build.mjs", "utf8");
  assert.equal(
    packageManifest.scripts["build:release"],
    "next build --webpack",
  );
  assert.match(dockerfile, /npm run build:release/u);
  assert.doesNotMatch(dockerfile, /npm run build(?:\s|&)/u);
  assert.deepEqual(
    Object.keys(
      sortManifestRecord({
        "/timeline/page": "app/timeline/page.js",
        "/page": "app/page.js",
        "/account/page": "app/account/page.js",
      }),
    ),
    ["/account/page", "/page", "/timeline/page"],
  );
  assert.throws(() => sortManifestRecord([]));
  assert.deepEqual(
    sortManifestValue({ workers: { timeline: "2", account: "1" }, id: "x" }),
    { id: "x", workers: { account: "1", timeline: "2" } },
  );
  const edgeProjection = serializeEdgeServerReferenceManifest({
    node: { actionB: { workers: { timeline: "2", account: "1" } } },
    edge: {},
    encryptionKey: "private-build-key",
  });
  const edgeManifest = JSON.parse(
    JSON.parse(edgeProjection.slice("self.__RSC_SERVER_MANIFEST=".length)),
  );
  assert.deepEqual(edgeManifest, {
    edge: {},
    encryptionKey: "process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
    node: { actionB: { workers: { account: "1", timeline: "2" } } },
  });
  assert.doesNotMatch(edgeProjection, /private-build-key/u);
  assert.equal(
    canonicalizeClientReferenceManifest(
      'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/horoscope/[sign]/page"]={"ssrModuleMapping":{"2":{"*":{"name":"*"}},"1":{"*":{"name":"*"}}},"clientModules":{"z":{"id":2},"a":{"id":1}}};',
    ),
    'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/horoscope/[sign]/page"]={"clientModules":{"a":{"id":1},"z":{"id":2}},"ssrModuleMapping":{"1":{"*":{"name":"*"}},"2":{"*":{"name":"*"}}}};',
  );
  assert.throws(() =>
    canonicalizeClientReferenceManifest("globalThis.bad={}));"),
  );
  for (const path of [
    ".next/app-path-routes-manifest.json",
    ".next/server/app-paths-manifest.json",
    ".next/standalone/.next/app-path-routes-manifest.json",
    ".next/standalone/.next/server/app-paths-manifest.json",
  ]) {
    assert.match(
      normalizer,
      new RegExp(path.replaceAll(".", String.raw`\.`), "u"),
    );
  }
  for (const path of [
    ".next/server",
    ".next/standalone/.next/server",
    "server-reference-manifest.json",
    "server-reference-manifest.js",
    "_client-reference-manifest.js",
  ]) {
    assert.match(
      normalizer,
      new RegExp(path.replaceAll(".", String.raw`\.`), "u"),
    );
  }
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
