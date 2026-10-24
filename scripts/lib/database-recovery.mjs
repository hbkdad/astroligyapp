import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const POLICY_SCHEMA = "astroligyapp.database-recovery-policy";
const ROLE_SCHEMA = "astroligyapp.database-role-manifest";
const DESCRIPTOR_SCHEMA = "astroligyapp.database-recovery-descriptor";
const ROLE_NAME = /^app_[a-z0-9_]{1,62}$/u;

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateRecoveryPolicy(policy) {
  assert.equal(policy?.schema, POLICY_SCHEMA);
  assert.equal(policy?.version, 1);
  assert.equal(policy?.postgresMajor, 18);
  assert.equal(policy?.backupFormat, "custom");
  for (const field of [
    "migrationCount",
    "expectedPublicTableCount",
    "expectedAuthTableCount",
    "expectedForcedRlsTableCount",
  ]) {
    assert.ok(Number.isSafeInteger(policy[field]) && policy[field] > 0, field);
  }
  assert.match(policy.latestMigration, /^\d{4}_[a-z0-9_]+$/u);
  assert.equal(policy.planningTargets?.authorizing, false);
  assertIntegerBetween(policy.planningTargets?.rpoMinutes, 1, 1_440, "RPO");
  assertIntegerBetween(policy.planningTargets?.rtoMinutes, 1, 480, "RTO");
  assertIntegerBetween(
    policy.planningTargets?.retentionDays,
    7,
    35,
    "retention",
  );
  assertIntegerBetween(
    policy.planningTargets?.restoreTestFrequencyDays,
    1,
    90,
    "restore frequency",
  );
  assert.ok(Array.isArray(policy.roles) && policy.roles.length > 0);
  const names = policy.roles.map((role) => role.name);
  assert.deepEqual(names, [...names].sort());
  assert.equal(new Set(names).size, names.length);
  for (const role of policy.roles) {
    assert.match(role.name, ROLE_NAME);
    assert.equal(typeof role.inherit, "boolean");
    assert.deepEqual(Object.keys(role).sort(), ["inherit", "name"]);
  }
  return policy;
}

export function validateRoleManifest(manifest, policy) {
  validateRecoveryPolicy(policy);
  assert.equal(manifest?.schema, ROLE_SCHEMA);
  assert.equal(manifest?.version, 1);
  assert.equal(manifest?.postgresMajor, policy.postgresMajor);
  assert.equal(manifest?.containsPasswords, false);
  assert.equal(manifest?.authorizing, false);
  assert.deepEqual(
    manifest.roles.map((role) => role.name),
    policy.roles.map((role) => role.name),
  );
  for (const [index, role] of manifest.roles.entries()) {
    assert.deepEqual(Object.keys(role).sort(), [
      "bypassRls",
      "canLogin",
      "createDb",
      "createRole",
      "inherit",
      "name",
      "replication",
      "superuser",
    ]);
    assert.equal(role.name, policy.roles[index].name);
    assert.equal(role.inherit, policy.roles[index].inherit);
    for (const field of [
      "bypassRls",
      "canLogin",
      "createDb",
      "createRole",
      "replication",
      "superuser",
    ]) {
      assert.equal(role[field], false, `${role.name}.${field}`);
    }
  }
  return manifest;
}

export function roleManifestSql(manifest, policy) {
  validateRoleManifest(manifest, policy);
  return manifest.roles
    .map(
      (role) =>
        `CREATE ROLE "${role.name}" NOLOGIN ${role.inherit ? "INHERIT" : "NOINHERIT"} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    )
    .join("\n");
}

export function createRecoveryDescriptor({
  archive,
  roleManifest,
  migrationSetSha256,
  policy,
  sourcePostgresMajor,
}) {
  validateRoleManifest(roleManifest, policy);
  assert.equal(sourcePostgresMajor, policy.postgresMajor);
  assert.match(migrationSetSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.ok(Buffer.isBuffer(archive) && archive.length > 0);
  return {
    schema: DESCRIPTOR_SCHEMA,
    version: 1,
    trust: "credential-free-synthetic",
    containsProductionData: false,
    restoreAuthorization: false,
    backupFormat: policy.backupFormat,
    postgresMajor: policy.postgresMajor,
    latestMigration: policy.latestMigration,
    migrationCount: policy.migrationCount,
    migrationSetSha256,
    archiveBytes: archive.length,
    archiveSha256: sha256(archive),
    roleManifestSha256: sha256(canonicalJson(roleManifest)),
  };
}

export function validateRecoveryDescriptor({
  archive,
  descriptor,
  roleManifest,
  migrationSetSha256,
  policy,
}) {
  assert.equal(descriptor?.schema, DESCRIPTOR_SCHEMA);
  assert.equal(descriptor?.version, 1);
  assert.equal(descriptor?.trust, "credential-free-synthetic");
  assert.equal(descriptor?.containsProductionData, false);
  assert.equal(descriptor?.restoreAuthorization, false);
  const expected = createRecoveryDescriptor({
    archive,
    roleManifest,
    migrationSetSha256,
    policy,
    sourcePostgresMajor: policy.postgresMajor,
  });
  assert.deepEqual(descriptor, expected);
  return descriptor;
}

function assertIntegerBetween(value, minimum, maximum, label) {
  assert.ok(Number.isSafeInteger(value), `${label} must be an integer`);
  assert.ok(value >= minimum && value <= maximum, `${label} is out of range`);
}
