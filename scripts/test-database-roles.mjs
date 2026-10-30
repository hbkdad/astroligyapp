import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import {
  beginMigrationSql,
  bootstrapRoleSql,
  finalizeRoleSql,
  validateDatabaseRolePolicy,
} from "./lib/database-roles.mjs";

const POSTGRES_IMAGE =
  "postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
const OPENSSL_IMAGE =
  "alpine/openssl@sha256:3f25da71f70eba788067daac3f3df03bd1de7a7c52ed89fa93b94ad2c92d986b";
const policy = validateDatabaseRolePolicy(
  JSON.parse(readFileSync("config/database-role-policy.json", "utf8")),
);
const suffix = randomBytes(6).toString("hex");
const container = `astroligyapp-roles-${suffix}`;
const tlsVolume = `astroligyapp-roles-tls-${suffix}`;
const administrator = "role_contract_admin";
const administratorPassword = `local_admin_${suffix}`;
const loginPassword = `local_login_${suffix}`;
let administratorPool;

try {
  const port = startPostgres();
  const administratorUrl = databaseUrl(
    administrator,
    administratorPassword,
    port,
  );
  administratorPool = new Pool({ connectionString: administratorUrl, max: 2 });
  const version = await administratorPool.query(
    "select current_setting('server_version_num')::integer / 10000 as major",
  );
  assert.equal(version.rows[0]?.major, policy.postgresMajor);

  await administratorPool.query(bootstrapRoleSql(policy));
  await setPassword(administratorPool, policy.migratorRole, loginPassword);
  run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "migrate"], {
    DATABASE_URL: administratorUrl,
  });
  const routinePrivilegesBefore =
    await readRoutinePrivileges(administratorPool);
  await administratorPool.query(finalizeRoleSql(policy));
  await administratorPool.query(beginMigrationSql(policy));
  const migratorUrl = `${databaseUrl(policy.migratorRole, loginPassword, port)}?options=-c%20role%3D${policy.ownerRole}`;
  const migratorPool = new Pool({ connectionString: migratorUrl, max: 1 });
  await migratorPool.query("begin");
  await migratorPool.query(
    "create table public.future_migration_probe(id integer)",
  );
  await migratorPool.query(
    "create function app.future_migration_probe() returns integer language sql as 'select 1'",
  );
  const futureFunctionAcl = await migratorPool.query(
    `select count(*)::integer as count
       from pg_proc routine
       cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) privilege
      where routine.oid = 'app.future_migration_probe()'::regprocedure
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'`,
  );
  assert.equal(futureFunctionAcl.rows[0]?.count, 0);
  await migratorPool.query("rollback");
  await migratorPool.end();
  await administratorPool.query(finalizeRoleSql(policy));
  for (const login of policy.runtimeLogins)
    await setPassword(administratorPool, login.name, loginPassword);
  run(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.database.config.ts",
    ],
    {
      TEST_DATABASE_URL: administratorUrl,
      TEST_DATABASE_ADMIN_ROLE: administrator,
    },
  );

  await verifyRoles(administratorPool);
  await verifyOwnership(administratorPool);
  await verifyRoutinePrivileges(administratorPool, routinePrivilegesBefore);
  for (const login of policy.runtimeLogins)
    await verifyRuntimeLogin(login, port);

  await administratorPool.query(
    `grant app_user to "${policy.runtimeLogins.find(({ name }) => name === "auth_http_executor").name}" with admin true, inherit true, set true`,
  );
  await administratorPool.query(finalizeRoleSql(policy));
  await verifyRoles(administratorPool);
  await verifyRoutinePrivileges(administratorPool, routinePrivilegesBefore);
  await verifyRuntimeLogin(policy.runtimeLogins[0], port);
  await verifyTls();

  console.log(
    `database role drill passed (PostgreSQL ${policy.postgresMajor}, ${policy.runtimeLogins.length} bounded logins, JIT migration authority revoked, ownership separated, TLS verify-full proved)`,
  );
} finally {
  await administratorPool?.end().catch(() => undefined);
  removeContainer();
}

async function verifyRoles(pool) {
  const names = [
    policy.ownerRole,
    policy.migratorRole,
    ...policy.runtimeLogins.map(({ name }) => name),
  ];
  const result = await pool.query(
    `select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
            rolreplication, rolbypassrls, rolinherit, rolconnlimit
       from pg_roles where rolname = any($1::text[]) order by rolname`,
    [names],
  );
  assert.equal(result.rowCount, names.length);
  for (const role of result.rows) {
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolcreatedb, false);
    assert.equal(role.rolcreaterole, false);
    assert.equal(role.rolreplication, false);
    assert.equal(role.rolbypassrls, false);
    assert.equal(role.rolinherit, false);
    if (role.rolname === policy.ownerRole) {
      assert.equal(role.rolcanlogin, false);
      assert.equal(role.rolconnlimit, -1);
    } else {
      assert.equal(role.rolcanlogin, true);
    }
  }

  const memberships = await pool.query(
    `select member.rolname as member, granted.rolname as granted,
            membership.admin_option, membership.inherit_option,
            membership.set_option
       from pg_auth_members membership
       join pg_roles member on member.oid = membership.member
       join pg_roles granted on granted.oid = membership.roleid
      where member.rolname = any($1::text[])
      order by member.rolname, granted.rolname`,
    [
      [
        policy.ownerRole,
        policy.migratorRole,
        ...policy.runtimeLogins.map(({ name }) => name),
      ],
    ],
  );
  const expected = policy.runtimeLogins.flatMap((login) =>
    login.memberships.map((membership) => ({
      member: login.name,
      granted: membership.role,
      admin_option: false,
      inherit_option: membership.inherit,
      set_option: membership.set,
    })),
  );
  assert.deepEqual(memberships.rows, expected);

  const bootstrapMemberships = await pool.query(
    `select granted.rolname
       from pg_auth_members membership
       join pg_roles member on member.oid = membership.member
       join pg_roles granted on granted.oid = membership.roleid
      where member.rolname = $1 and granted.rolname like 'app\\_%' escape '\\'`,
    [administrator],
  );
  assert.equal(bootstrapMemberships.rowCount, 0);

  const ownerSecret = await pool.query(
    "select rolpassword from pg_authid where rolname = $1",
    [policy.ownerRole],
  );
  assert.equal(ownerSecret.rows[0]?.rolpassword, null);
}

async function verifyOwnership(pool) {
  const database = await pool.query(
    "select pg_get_userbyid(datdba) as owner from pg_database where datname = current_database()",
  );
  assert.equal(database.rows[0]?.owner, policy.ownerRole);
  const publicDatabasePrivileges = await pool.query(
    `select count(*)::integer as count
       from pg_database database
       cross join lateral aclexplode(coalesce(database.datacl, acldefault('d', database.datdba))) privilege
      where database.datname = current_database()
        and privilege.grantee = 0`,
  );
  assert.equal(publicDatabasePrivileges.rows[0]?.count, 0);
  const tables = await pool.query(
    `select schemaname, tablename, tableowner from pg_tables
      where schemaname in ('auth', 'public') order by schemaname, tablename`,
  );
  assert.ok(tables.rowCount > 0);
  assert.ok(
    tables.rows.every(({ tableowner }) => tableowner === policy.ownerRole),
  );
  const types = await pool.query(
    `select pg_get_userbyid(type.typowner) as owner
       from pg_type type join pg_namespace namespace on namespace.oid = type.typnamespace
      where namespace.nspname in ('auth', 'public') and type.typtype in ('d', 'e')`,
  );
  assert.ok(types.rows.every(({ owner }) => owner === policy.ownerRole));
  const forbiddenOwners = await pool.query(
    `select count(*)::integer as count from pg_class object
       join pg_roles owner on owner.oid = object.relowner
      where owner.rolname = any($1::text[])
        and object.relkind in ('r', 'p', 'S', 'v', 'm')`,
    [[policy.migratorRole, ...policy.runtimeLogins.map(({ name }) => name)]],
  );
  assert.equal(forbiddenOwners.rows[0]?.count, 0);
  const forbiddenRoutineOwners = await pool.query(
    `select count(*)::integer as count from pg_proc routine
       join pg_roles owner on owner.oid = routine.proowner
      where owner.rolname = any($1::text[])`,
    [[policy.migratorRole, ...policy.runtimeLogins.map(({ name }) => name)]],
  );
  assert.equal(forbiddenRoutineOwners.rows[0]?.count, 0);
  const forbiddenSchemaOwners = await pool.query(
    `select count(*)::integer as count from pg_namespace namespace
       join pg_roles owner on owner.oid = namespace.nspowner
      where owner.rolname = any($1::text[])`,
    [[policy.migratorRole, ...policy.runtimeLogins.map(({ name }) => name)]],
  );
  assert.equal(forbiddenSchemaOwners.rows[0]?.count, 0);
  const unsafeOwnerDefaults = await pool.query(
    `select count(*)::integer as count
       from pg_default_acl defaults
       join pg_roles owner on owner.oid = defaults.defaclrole
       cross join lateral aclexplode(defaults.defaclacl) privilege
      where owner.rolname = $1
        and privilege.grantee = 0`,
    [policy.ownerRole],
  );
  assert.equal(unsafeOwnerDefaults.rows[0]?.count, 0);
}

async function readRoutinePrivileges(pool) {
  const result = await pool.query(
    `select routine.oid::text as oid,
            case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end as grantee,
            privilege.privilege_type,
            privilege.is_grantable
       from pg_proc routine
       join pg_namespace namespace on namespace.oid = routine.pronamespace
       cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) privilege
      where namespace.nspname in ('app', 'auth', 'public')
        and privilege.grantee <> routine.proowner
      order by routine.oid, grantee, privilege.privilege_type`,
  );
  return result.rows;
}

async function verifyRoutinePrivileges(pool, expected) {
  assert.deepEqual(await readRoutinePrivileges(pool), expected);
  const publicSecurityDefiner = await pool.query(
    `select count(*)::integer as count
       from pg_proc routine
       join pg_namespace namespace on namespace.oid = routine.pronamespace
       cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) privilege
      where namespace.nspname in ('app', 'auth', 'public')
        and routine.prosecdef
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'`,
  );
  assert.equal(publicSecurityDefiner.rows[0]?.count, 0);
}

async function verifyRuntimeLogin(login, port) {
  const pool = new Pool({
    connectionString: databaseUrl(login.name, loginPassword, port),
    max: 1,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  try {
    const settings = await pool.query(
      `select current_user, current_role,
              extract(epoch from current_setting('statement_timeout')::interval)::integer * 1000 as statement_timeout_ms,
              extract(epoch from current_setting('lock_timeout')::interval)::integer * 1000 as lock_timeout_ms,
              extract(epoch from current_setting('idle_in_transaction_session_timeout')::interval)::integer * 1000 as idle_timeout_ms,
              extract(epoch from current_setting('transaction_timeout')::interval)::integer * 1000 as transaction_timeout_ms`,
    );
    assert.deepEqual(settings.rows[0], {
      current_user: login.name,
      current_role: login.name,
      statement_timeout_ms: policy.runtime.statementTimeoutMs,
      lock_timeout_ms: policy.runtime.lockTimeoutMs,
      idle_timeout_ms: policy.runtime.idleInTransactionTimeoutMs,
      transaction_timeout_ms: policy.runtime.transactionTimeoutMs,
    });
    await rejectsQuery(pool, "create role forbidden_role");
    await rejectsQuery(pool, "create schema forbidden_schema");
    await rejectsQuery(pool, "create table public.forbidden_table(id integer)");

    for (const membership of login.memberships) {
      if (membership.inherit) {
        const inherited = await pool.query(
          "select has_schema_privilege(current_user, 'auth', 'USAGE') as usable",
        );
        assert.equal(inherited.rows[0]?.usable, true);
        await rejectsQuery(pool, `set role "${membership.role}"`);
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`set local role "${membership.role}"`);
        const active = await client.query("select current_role");
        assert.equal(active.rows[0]?.current_role, membership.role);
        await client.query(
          "set local app.current_user_id = '00000000-0000-4000-8000-000000000094'",
        );
        await client.query("rollback");
      } finally {
        client.release();
      }
      const clean = await pool.query(
        "select current_role, current_setting('app.current_user_id', true) as owner",
      );
      assert.equal(clean.rows[0]?.current_role, login.name);
      assert.ok(clean.rows[0]?.owner === null || clean.rows[0]?.owner === "");
    }
  } finally {
    await pool.end();
  }
}

async function rejectsQuery(pool, sql) {
  await assert.rejects(pool.query(sql));
}

async function setPassword(pool, role, password) {
  assert.match(role, /^[a-z][a-z0-9_]{2,62}$/u);
  assert.match(password, /^local_login_[0-9a-f]{12}$/u);
  await pool.query(`alter role "${role}" password '${password}'`);
}

async function verifyTls() {
  capture("docker", [
    "run",
    "--rm",
    "--volume",
    `${tlsVolume}:/out`,
    OPENSSL_IMAGE,
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost",
    "-keyout",
    "/out/server.key",
    "-out",
    "/out/server.crt",
  ]);
  capture("docker", [
    "exec",
    "--user",
    "root",
    container,
    "sh",
    "-ceu",
    "chown postgres:postgres /tls/server.key /tls/server.crt; chmod 600 /tls/server.key; chmod 644 /tls/server.crt",
  ]);
  await administratorPool.query("alter system set ssl = 'on'");
  await administratorPool.query(
    "alter system set ssl_cert_file = '/tls/server.crt'",
  );
  await administratorPool.query(
    "alter system set ssl_key_file = '/tls/server.key'",
  );
  await administratorPool.query("select pg_reload_conf()");
  const valid = capture("docker", [
    "exec",
    "--env",
    `PGPASSWORD=${loginPassword}`,
    container,
    "psql",
    `postgresql://${policy.runtimeLogins[0].name}@localhost:5432/${policy.database}?sslmode=verify-full&sslrootcert=/tls/server.crt`,
    "--tuples-only",
    "--no-align",
    "--command",
    "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
  ]);
  assert.equal(valid.trim(), "t");
  capture("docker", [
    "run",
    "--rm",
    "--volume",
    `${tlsVolume}:/out`,
    OPENSSL_IMAGE,
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=wrong",
    "-keyout",
    "/out/wrong.key",
    "-out",
    "/out/wrong.crt",
  ]);
  const rejected = spawnSync("docker", [
    "exec",
    "--env",
    `PGPASSWORD=${loginPassword}`,
    container,
    "psql",
    `postgresql://${policy.runtimeLogins[0].name}@localhost:5432/${policy.database}?sslmode=verify-full&sslrootcert=/tls/wrong.crt`,
    "--command",
    "select 1",
  ]);
  assert.notEqual(
    rejected.status,
    0,
    "untrusted certificate chain was accepted",
  );
}

function startPostgres() {
  capture("docker", ["volume", "create", tlsVolume]);
  capture("docker", [
    "run",
    "--detach",
    "--name",
    container,
    "--publish",
    "127.0.0.1::5432",
    "--tmpfs",
    "/var/lib/postgresql:size=512m",
    "--volume",
    `${tlsVolume}:/tls`,
    "--security-opt",
    "no-new-privileges:true",
    "--env",
    `POSTGRES_DB=${policy.database}`,
    "--env",
    `POSTGRES_USER=${administrator}`,
    "--env",
    `POSTGRES_PASSWORD=${administratorPassword}`,
    POSTGRES_IMAGE,
  ]);
  let consecutive = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = spawnSync("docker", [
      "exec",
      container,
      "pg_isready",
      "--username",
      administrator,
      "--dbname",
      policy.database,
    ]);
    consecutive = ready.status === 0 ? consecutive + 1 : 0;
    if (consecutive >= 6) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  assert.ok(consecutive >= 6, "PostgreSQL did not become continuously ready");
  const port = capture("docker", ["port", container, "5432/tcp"]).trim();
  const match = /127\.0\.0\.1:(\d+)/u.exec(port);
  assert.ok(match);
  return Number(match[1]);
}

function databaseUrl(user, password, port) {
  return `postgresql://${user}:${password}@127.0.0.1:${port}/${policy.database}`;
}

function run(command, args, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
  assert.equal(result.status, 0, `${command} failed with ${result.status}`);
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `${command} failed: ${(result.stderr || result.stdout).trim()}`,
  );
  return result.stdout;
}

function removeContainer() {
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  spawnSync("docker", ["volume", "rm", "--force", tlsVolume], {
    stdio: "ignore",
  });
}
