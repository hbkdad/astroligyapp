import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";

const PUBLIC_STATIC_OUTPUT =
  /^app\/\.next\/server\/app\/(?:index|timeline)(?:\.(?:html|rsc)|\.segments\/_full\.segment\.rsc)$/u;

export function summarizePublicStaticContentDiff({
  path,
  pathA,
  pathB,
  secret,
}) {
  if (
    !PUBLIC_STATIC_OUTPUT.test(path) ||
    !lstatSync(pathA, { throwIfNoEntry: false })?.isFile() ||
    !lstatSync(pathB, { throwIfNoEntry: false })?.isFile()
  )
    return {};
  assert.equal(typeof secret, "string");
  assert.ok(secret.length >= 32);
  const a = readFileSync(pathA);
  const b = readFileSync(pathB);
  const secretBytes = Buffer.from(secret);
  assert.equal(
    a.includes(secretBytes),
    false,
    "build secret entered static output",
  );
  assert.equal(
    b.includes(secretBytes),
    false,
    "build secret entered static output",
  );
  const firstDifference = firstDifferentByte(a, b);
  return {
    publicContentDiff: {
      firstDifference,
      commonSuffixBytes: commonSuffixLength(a, b, firstDifference),
      lengthA: a.length,
      lengthB: b.length,
      excerptA: safePublicExcerpt(a, firstDifference),
      excerptB: safePublicExcerpt(b, firstDifference),
    },
  };
}

function firstDifferentByte(a, b) {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1)
    if (a[index] !== b[index]) return index;
  return length;
}

function commonSuffixLength(a, b, firstDifference) {
  const limit = Math.min(a.length, b.length) - firstDifference;
  let count = 0;
  while (count < limit && a[a.length - count - 1] === b[b.length - count - 1])
    count += 1;
  return count;
}

function safePublicExcerpt(value, offset) {
  const start = Math.max(0, offset - 120);
  const end = Math.min(value.length, offset + 240);
  const excerpt = value.subarray(start, end).toString("utf8");
  assert.doesNotMatch(
    excerpt,
    /(private.?key|client.?secret|access.?key|session.?token|authorization:\s*bearer)/iu,
  );
  return excerpt.replace(/[A-Za-z0-9_-]{40,}/gu, (token) => {
    const digest = createHash("sha256")
      .update(token)
      .digest("hex")
      .slice(0, 12);
    return `<redacted-token:${digest}:${token.length}>`;
  });
}
