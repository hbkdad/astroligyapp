import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalJson,
  createRecoveryDescriptor,
  roleManifestSql,
  sha256,
  validateRecoveryDescriptor,
  validateRecoveryPolicy,
  validateRoleManifest,
} from "./lib/database-recovery.mjs";

const policy = validateRecoveryPolicy(
  JSON.parse(readFileSync("config/database-recovery-policy.json", "utf8")),
);
const roles = policy.roles.map((role) => ({
  name: role.name,
  inherit: role.inherit,
  canLogin: false,
  superuser: false,
  createDb: false,
  createRole: false,
  replication: false,
  bypassRls: false,
}));
const manifest = {
  schema: "astroligyapp.database-role-manifest",
  version: 1,
  postgresMajor: 18,
  containsPasswords: false,
  authorizing: false,
  roles,
};
const archive = Buffer.from("synthetic custom archive fixture");
const migrationSetSha256 = sha256("synthetic migration set");
const descriptor = createRecoveryDescriptor({
  archive,
  roleManifest: manifest,
  migrationSetSha256,
  policy,
  sourcePostgresMajor: 18,
});

validateRoleManifest(manifest, policy);
validateRecoveryDescriptor({
  archive,
  descriptor,
  roleManifest: manifest,
  migrationSetSha256,
  policy,
});
const sql = roleManifestSql(manifest, policy);
assert.doesNotMatch(
  sql,
  /(?:^|\s)(?:LOGIN|SUPERUSER|CREATEDB|CREATEROLE|REPLICATION|BYPASSRLS|PASSWORD)(?:\s|;|$)/u,
);
assert.equal((sql.match(/CREATE ROLE/gu) ?? []).length, policy.roles.length);
assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');

const unsafeCases = [
  () => validateRecoveryPolicy({ ...policy, postgresMajor: 17 }),
  () => validateRecoveryPolicy({ ...policy, migrationCount: 0 }),
  () =>
    validateRecoveryPolicy({
      ...policy,
      planningTargets: { ...policy.planningTargets, authorizing: true },
    }),
  () => validateRoleManifest({ ...manifest, postgresMajor: 17 }, policy),
  () => validateRoleManifest({ ...manifest, containsPasswords: true }, policy),
  () => validateRoleManifest({ ...manifest, roles: roles.slice(1) }, policy),
  ...[
    "canLogin",
    "superuser",
    "createDb",
    "createRole",
    "replication",
    "bypassRls",
  ].map(
    (field) => () =>
      validateRoleManifest(
        {
          ...manifest,
          roles: roles.map((role, index) =>
            index === 0 ? { ...role, [field]: true } : role,
          ),
        },
        policy,
      ),
  ),
  () =>
    validateRecoveryDescriptor({
      archive: Buffer.concat([archive, Buffer.from("tampered")]),
      descriptor,
      roleManifest: manifest,
      migrationSetSha256,
      policy,
    }),
  () =>
    validateRecoveryDescriptor({
      archive,
      descriptor: { ...descriptor, archiveSha256: sha256("wrong") },
      roleManifest: manifest,
      migrationSetSha256,
      policy,
    }),
  () =>
    validateRecoveryDescriptor({
      archive,
      descriptor: { ...descriptor, restoreAuthorization: true },
      roleManifest: manifest,
      migrationSetSha256,
      policy,
    }),
  () =>
    validateRecoveryDescriptor({
      archive,
      descriptor,
      roleManifest: manifest,
      migrationSetSha256: sha256("mixed migration set"),
      policy,
    }),
];
for (const unsafe of unsafeCases) assert.throws(unsafe);

console.log(
  `database recovery contract passed (${unsafeCases.length} unsafe cases rejected)`,
);
