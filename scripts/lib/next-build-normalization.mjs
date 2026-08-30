import assert from "node:assert/strict";

export function sortManifestRecord(record) {
  assert.ok(
    record !== null && typeof record === "object" && !Array.isArray(record),
    "Next route manifest must be a JSON object",
  );

  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
