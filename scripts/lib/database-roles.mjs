import assert from "node:assert/strict";

const POLICY_SCHEMA = "astroligyapp.database-role-policy";
const ROLE_NAME = /^[a-z][a-z0-9_]{2,62}$/u;

export function validateDatabaseRolePolicy(policy) {
  assert.deepEqual(Object.keys(policy ?? {}).sort(), [
    "credentialProvisioning",
    "database",
    "migrator",
    "migratorRole",
    "ownerRole",
    "postgresMajor",
    "runtime",
    "runtimeLogins",
    "schema",
    "tlsMode",
    "version",
  ]);
  assert.equal(policy?.schema, POLICY_SCHEMA);
  assert.equal(policy?.version, 1);
  assert.equal(policy?.postgresMajor, 18);
  assert.match(policy?.database, ROLE_NAME);
  assert.equal(policy?.tlsMode, "verify-full");
  assert.equal(policy?.credentialProvisioning, "external-secret-manager");
  assert.match(policy?.ownerRole, ROLE_NAME);
  assert.match(policy?.migratorRole, ROLE_NAME);
  assert.notEqual(policy.ownerRole, policy.migratorRole);
  validateTimeouts(policy.migrator, 2, "migrator");
  validateTimeouts(policy.runtime, undefined, "runtime");
  assert.ok(
    Array.isArray(policy.runtimeLogins) && policy.runtimeLogins.length > 0,
  );
  const names = policy.runtimeLogins.map(({ name }) => name);
  assert.deepEqual(names, [...names].sort());
  assert.equal(new Set(names).size, names.length);
  assert.ok(!names.includes(policy.ownerRole));
  assert.ok(!names.includes(policy.migratorRole));
  for (const login of policy.runtimeLogins) {
    assert.deepEqual(Object.keys(login).sort(), [
      "connectionLimit",
      "memberships",
      "name",
    ]);
    assert.match(login.name, ROLE_NAME);
    assertInteger(
      login.connectionLimit,
      1,
      16,
      `${login.name}.connectionLimit`,
    );
    assert.ok(Array.isArray(login.memberships) && login.memberships.length > 0);
    const membershipNames = login.memberships.map(({ role }) => role);
    assert.deepEqual(membershipNames, [...membershipNames].sort());
    assert.equal(new Set(membershipNames).size, membershipNames.length);
    for (const membership of login.memberships) {
      assert.deepEqual(Object.keys(membership).sort(), [
        "inherit",
        "role",
        "set",
      ]);
      assert.match(membership.role, /^app_[a-z0-9_]{1,62}$/u);
      assert.equal(typeof membership.inherit, "boolean");
      assert.equal(typeof membership.set, "boolean");
      assert.ok(membership.inherit !== membership.set);
      assert.notEqual(membership.role, policy.ownerRole);
      assert.notEqual(membership.role, policy.migratorRole);
    }
  }
  return policy;
}

export function bootstrapRoleSql(policy) {
  validateDatabaseRolePolicy(policy);
  return [
    roleBlock(policy.ownerRole, "NOLOGIN", 0),
    roleBlock(policy.migratorRole, "LOGIN", policy.migrator.connectionLimit),
    `ALTER DATABASE ${identifier(policy.database)} OWNER TO ${identifier(policy.ownerRole)};`,
    `REVOKE ALL ON DATABASE ${identifier(policy.database)} FROM PUBLIC;`,
    roleSettings(policy.migratorRole, policy.database, policy.migrator),
    `GRANT CONNECT, TEMPORARY ON DATABASE ${identifier(policy.database)} TO ${identifier(policy.migratorRole)};`,
  ].join("\n");
}

export function beginMigrationSql(policy) {
  validateDatabaseRolePolicy(policy);
  return `GRANT ${identifier(policy.ownerRole)} TO ${identifier(policy.migratorRole)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;`;
}

export function finalizeRoleSql(policy) {
  validateDatabaseRolePolicy(policy);
  const runtime = policy.runtimeLogins.flatMap((login) => [
    roleBlock(login.name, "LOGIN", login.connectionLimit),
    roleSettings(login.name, policy.database, policy.runtime),
    `GRANT CONNECT ON DATABASE ${identifier(policy.database)} TO ${identifier(login.name)};`,
    revokeUnexpectedMembershipsSql(login),
    ...login.memberships.map(
      (membership) =>
        `GRANT ${identifier(membership.role)} TO ${identifier(login.name)} WITH ADMIN FALSE, INHERIT ${membership.inherit ? "TRUE" : "FALSE"}, SET ${membership.set ? "TRUE" : "FALSE"};`,
    ),
  ]);
  return [
    transferOwnedObjectsSql(policy.ownerRole),
    defaultPrivilegesSql(policy.ownerRole),
    `REVOKE ${identifier(policy.ownerRole)} FROM ${identifier(policy.migratorRole)};`,
    ...runtime,
    revokeBootstrapMembershipsSql(policy),
  ].join("\n");
}

function defaultPrivilegesSql(ownerRole) {
  return [
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(ownerRole)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(ownerRole)} REVOKE ALL ON TABLES FROM PUBLIC;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(ownerRole)} REVOKE ALL ON SEQUENCES FROM PUBLIC;`,
  ].join("\n");
}

function revokeUnexpectedMembershipsSql(login) {
  const expected = login.memberships
    .map(({ role }) => literal(role))
    .join(", ");
  return `DO $memberships$ DECLARE role_name text; BEGIN FOR role_name IN SELECT granted.rolname FROM pg_auth_members membership JOIN pg_roles member ON member.oid = membership.member JOIN pg_roles granted ON granted.oid = membership.roleid WHERE member.rolname = ${literal(login.name)} AND granted.rolname NOT IN (${expected}) LOOP EXECUTE format('REVOKE %I FROM %I', role_name, ${literal(login.name)}); END LOOP; END $memberships$;`;
}

function revokeBootstrapMembershipsSql(policy) {
  return `DO $bootstrap$ DECLARE role_name text; BEGIN IF current_user IN (${literal(policy.ownerRole)}, ${literal(policy.migratorRole)}) THEN RAISE EXCEPTION 'finalizer requires the isolated bootstrap administrator'; END IF; FOR role_name IN SELECT granted.rolname FROM pg_auth_members membership JOIN pg_roles member ON member.oid = membership.member JOIN pg_roles granted ON granted.oid = membership.roleid WHERE member.rolname = current_user AND granted.rolname LIKE 'app\\_%' ESCAPE '\\' LOOP EXECUTE format('REVOKE %I FROM %I', role_name, current_user); END LOOP; END $bootstrap$;`;
}

function transferOwnedObjectsSql(ownerRole) {
  const owner = literal(ownerRole);
  return `DO $ownership$ DECLARE object record; BEGIN
    FOR object IN
      SELECT namespace.nspname, class.relname, class.relkind
        FROM pg_class class JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
       WHERE class.relowner = current_user::regrole
         AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname !~ '^pg_toast'
    LOOP
      IF object.relkind IN ('r', 'p', 'v', 'm', 'f') THEN
        EXECUTE format('ALTER TABLE %I.%I OWNER TO %I', object.nspname, object.relname, ${owner});
      END IF;
    END LOOP;
    FOR object IN
      SELECT namespace.nspname, class.relname
        FROM pg_class class JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
       WHERE class.relowner = current_user::regrole
         AND class.relkind = 'S'
         AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
         AND namespace.nspname !~ '^pg_toast'
    LOOP
      EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO %I', object.nspname, object.relname, ${owner});
    END LOOP;
    FOR object IN
      SELECT procedure.oid::regprocedure::text AS identity, procedure.prokind
        FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
       WHERE procedure.proowner = current_user::regrole
         AND procedure.prokind IN ('f', 'p', 'w')
         AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    LOOP
      EXECUTE format('ALTER %s %s OWNER TO %I', CASE WHEN object.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, object.identity, ${owner});
    END LOOP;
    FOR object IN
      SELECT namespace.nspname, type.typname
        FROM pg_type type JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
       WHERE type.typowner = current_user::regrole
         AND type.typtype IN ('d', 'e')
         AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    LOOP
      EXECUTE format('ALTER TYPE %I.%I OWNER TO %I', object.nspname, object.typname, ${owner});
    END LOOP;
    FOR object IN
      SELECT namespace.nspname
        FROM pg_namespace namespace
       WHERE namespace.nspowner = current_user::regrole
         AND namespace.nspname NOT IN ('pg_catalog', 'information_schema', 'public')
         AND namespace.nspname !~ '^pg_'
    LOOP
      EXECUTE format('ALTER SCHEMA %I OWNER TO %I', object.nspname, ${owner});
    END LOOP;
  END $ownership$;`;
}

export function validateProductionDatabaseUrl(value, expectedLogin) {
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0 && value.length <= 2_048);
  assert.doesNotMatch(value, /[\0\r\n]/u);
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(decodeURIComponent(url.username), expectedLogin);
  assert.ok(url.password.length > 0);
  assert.ok(url.hostname.length > 0);
  assert.ok(url.pathname.length > 1);
  assert.equal(url.hash, "");
  assert.deepEqual(url.searchParams.getAll("sslmode"), ["verify-full"]);
  rejectUrlOverrides(url);
  return value;
}

function rejectUrlOverrides(url) {
  for (const forbidden of [
    "database",
    "db",
    "host",
    "options",
    "password",
    "port",
    "user",
  ])
    assert.equal(url.searchParams.has(forbidden), false);
}

function roleBlock(name, login, connectionLimit) {
  const limit = login === "LOGIN" ? ` CONNECTION LIMIT ${connectionLimit}` : "";
  const existingPassword = login === "NOLOGIN" ? " PASSWORD NULL" : "";
  return `DO $role$ BEGIN CREATE ROLE ${identifier(name)} ${login} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS${limit} PASSWORD NULL; EXCEPTION WHEN duplicate_object THEN ALTER ROLE ${identifier(name)} ${login} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS${limit}${existingPassword}; END $role$;`;
}

function roleSettings(role, database, settings) {
  return [
    ["statement_timeout", settings.statementTimeoutMs],
    ["lock_timeout", settings.lockTimeoutMs],
    [
      "idle_in_transaction_session_timeout",
      settings.idleInTransactionTimeoutMs,
    ],
    ["transaction_timeout", settings.transactionTimeoutMs],
  ]
    .map(
      ([name, value]) =>
        `ALTER ROLE ${identifier(role)} IN DATABASE ${identifier(database)} SET ${name} = ${literal(`${value}ms`)};`,
    )
    .join("\n");
}

function validateTimeouts(value, connectionLimit, label) {
  assert.equal(typeof value, "object");
  assert.deepEqual(Object.keys(value).sort(), [
    ...(connectionLimit === undefined ? [] : ["connectionLimit"]),
    "idleInTransactionTimeoutMs",
    "lockTimeoutMs",
    "statementTimeoutMs",
    "transactionTimeoutMs",
  ]);
  if (connectionLimit !== undefined)
    assertInteger(
      value.connectionLimit,
      connectionLimit,
      connectionLimit,
      `${label}.connectionLimit`,
    );
  assertInteger(
    value.statementTimeoutMs,
    1_000,
    600_000,
    `${label}.statementTimeoutMs`,
  );
  assertInteger(
    value.lockTimeoutMs,
    100,
    value.statementTimeoutMs - 1,
    `${label}.lockTimeoutMs`,
  );
  assertInteger(
    value.idleInTransactionTimeoutMs,
    1_000,
    value.transactionTimeoutMs - 1,
    `${label}.idleInTransactionTimeoutMs`,
  );
  assertInteger(
    value.transactionTimeoutMs,
    value.statementTimeoutMs + 1,
    1_800_000,
    `${label}.transactionTimeoutMs`,
  );
}

function assertInteger(value, minimum, maximum, label) {
  assert.ok(Number.isSafeInteger(value), `${label} must be an integer`);
  assert.ok(value >= minimum && value <= maximum, `${label} is out of range`);
}

function identifier(value) {
  assert.match(value, ROLE_NAME);
  return `"${value}"`;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
