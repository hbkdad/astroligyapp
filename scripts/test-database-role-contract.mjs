import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  beginMigrationSql,
  bootstrapRoleSql,
  finalizeRoleSql,
  validateDatabaseRolePolicy,
  validateProductionDatabaseUrl,
} from "./lib/database-roles.mjs";

const policy = validateDatabaseRolePolicy(
  JSON.parse(readFileSync("config/database-role-policy.json", "utf8")),
);
const bootstrap = bootstrapRoleSql(policy);
const begin = beginMigrationSql(policy);
const finalize = finalizeRoleSql(policy);

assert.doesNotMatch(
  `${bootstrap}\n${begin}\n${finalize}`,
  /replace-me|PASSWORD\s+'[^']+'/iu,
);
assert.match(bootstrap, /PASSWORD NULL/u);
assert.match(bootstrap, /REVOKE ALL ON DATABASE "cosmic" FROM PUBLIC/u);
assert.doesNotMatch(begin, /CREATEROLE|SUPERUSER|BYPASSRLS/u);
assert.match(finalize, /NOCREATEROLE/u);
assert.doesNotMatch(finalize, /REASSIGN OWNED|CASCADE/u);
assert.match(finalize, /WITH ADMIN FALSE, INHERIT FALSE, SET TRUE/u);
assert.match(finalize, /WITH ADMIN FALSE, INHERIT TRUE, SET FALSE/u);
assert.doesNotMatch(finalize, /WITH ADMIN TRUE|\bBYPASSRLS\b|\bSUPERUSER\b/u);
assert.match(
  finalize,
  /ALTER DEFAULT PRIVILEGES[\s\S]+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/u,
);

const validUrl =
  "postgresql://app_runtime_executor:synthetic@database.example:5432/cosmic?sslmode=verify-full";
assert.equal(
  validateProductionDatabaseUrl(validUrl, "app_runtime_executor"),
  validUrl,
);

const unsafeUrls = [
  "postgresql://app_runtime_executor:synthetic@database.example:5432/cosmic",
  "postgresql://app_runtime_executor:synthetic@database.example:5432/cosmic?sslmode=require",
  "postgresql://wrong:synthetic@database.example:5432/cosmic?sslmode=verify-full",
  "postgresql://app_runtime_executor@database.example:5432/cosmic?sslmode=verify-full",
  "postgresql://app_runtime_executor:synthetic@:5432/cosmic?sslmode=verify-full",
  "postgres://app_runtime_executor:synthetic@database.example:5432/cosmic?sslmode=verify-full",
  "postgresql://app_runtime_executor:synthetic@database.example:5432/cosmic?sslmode=verify-full&sslmode=verify-full",
  "postgresql://app_runtime_executor:synthetic@database.example:5432/cosmic?sslmode=verify-full#fragment",
  "postgresql://app_runtime_executor:synthetic@database.example:5432/cosmic?sslmode=verify-full&user=role_contract_admin",
  "postgresql://app_runtime_executor:synthetic@database.example:5432/cosmic?sslmode=verify-full&options=-c%20role%3Dapp_database_owner",
];
for (const url of unsafeUrls)
  assert.throws(() =>
    validateProductionDatabaseUrl(url, "app_runtime_executor"),
  );

const unsafePolicies = [
  { ...policy, password: "must-not-appear" },
  { ...policy, postgresMajor: 17 },
  { ...policy, tlsMode: "require" },
  { ...policy, credentialProvisioning: "checked-in" },
  { ...policy, ownerRole: policy.migratorRole },
  { ...policy, runtimeLogins: [...policy.runtimeLogins].reverse() },
  {
    ...policy,
    runtimeLogins: [...policy.runtimeLogins, policy.runtimeLogins[0]],
  },
  {
    ...policy,
    runtime: {
      ...policy.runtime,
      lockTimeoutMs: policy.runtime.statementTimeoutMs,
    },
  },
  {
    ...policy,
    runtime: {
      ...policy.runtime,
      transactionTimeoutMs: policy.runtime.statementTimeoutMs,
    },
  },
  {
    ...policy,
    runtimeLogins: policy.runtimeLogins.map((login, index) =>
      index === 0
        ? {
            ...login,
            memberships: [
              { role: policy.ownerRole, inherit: false, set: true },
            ],
          }
        : login,
    ),
  },
  {
    ...policy,
    runtimeLogins: policy.runtimeLogins.map((login, index) =>
      index === 0 ? { ...login, connectionLimit: 100 } : login,
    ),
  },
];
for (const unsafe of unsafePolicies)
  assert.throws(() => validateDatabaseRolePolicy(unsafe));

console.log(
  `database role contract passed (${unsafeUrls.length + unsafePolicies.length} unsafe cases rejected, ${policy.runtimeLogins.length} bounded runtime logins)`,
);
