import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import {
  canonicalJson,
  createRecoveryDescriptor,
  roleManifestSql,
  sha256,
  validateRecoveryDescriptor,
  validateRecoveryPolicy,
  validateRoleManifest,
} from "./lib/database-recovery.mjs";

const POSTGRES_IMAGE =
  "postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
const suffix = randomBytes(6).toString("hex");
const sourceContainer = `astroligyapp-recovery-source-${suffix}`;
const targetContainer = `astroligyapp-recovery-target-${suffix}`;
const sourceAdmin = "recovery_migration_owner";
const targetAdmin = "recovery_target_admin";
const localPassword = `credential_free_${suffix}`;
const sourceDatabase = "cosmic_source";
const targetBootstrapDatabase = "cosmic_target";
const restoredDatabase = "cosmic_restore";
const temporaryRoot = mkdtempSync(join(tmpdir(), "astroligyapp-recovery-"));
const archivePath = join(temporaryRoot, "cosmic.dump");
const globalsPath = join(temporaryRoot, "globals-inspection.sql");
const roleManifestPath = join(temporaryRoot, "role-manifest.json");
const descriptorPath = join(temporaryRoot, "descriptor.json");
const policy = validateRecoveryPolicy(
  JSON.parse(readFileSync("config/database-recovery-policy.json", "utf8")),
);
const ownerA = "00000000-0000-4000-8000-0000000000a1";
const ownerB = "00000000-0000-4000-8000-0000000000b2";
let sourcePool;
let targetPool;

try {
  const sourcePort = startPostgres(
    sourceContainer,
    sourceAdmin,
    sourceDatabase,
  );
  const sourceUrl = databaseUrl(sourceAdmin, sourcePort, sourceDatabase);
  run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "migrate"], {
    DATABASE_URL: sourceUrl,
  });
  sourcePool = new Pool({ connectionString: sourceUrl, max: 2 });
  const sourceMajor = await postgresMajor(sourcePool);
  assert.equal(sourceMajor, policy.postgresMajor);
  assert.equal(toolMajor(sourceContainer, "pg_dump"), policy.postgresMajor);
  assert.equal(toolMajor(sourceContainer, "pg_restore"), policy.postgresMajor);
  await seedSyntheticRecoveryData(sourcePool);
  const sourceSchema = schemaSnapshot(
    sourceContainer,
    sourceAdmin,
    sourceDatabase,
  );
  const sourceMigrationHistory = await migrationHistory(sourcePool);

  const roleManifest = await readRoleManifest(sourcePool);
  validateRoleManifest(roleManifest, policy);
  writeFileSync(roleManifestPath, canonicalJson(roleManifest));

  const globals = capture("docker", [
    "exec",
    sourceContainer,
    "pg_dumpall",
    "--roles-only",
    "--no-role-passwords",
    "--username",
    sourceAdmin,
  ]);
  assert.doesNotMatch(globals, /PASSWORD\s+(?:'[^']*'|\S+)/iu);
  for (const role of policy.roles)
    assert.match(globals, new RegExp(role.name, "u"));
  writeFileSync(globalsPath, globals);

  run("docker", [
    "exec",
    sourceContainer,
    "pg_dump",
    "--format=custom",
    "--no-owner",
    "--file=/tmp/cosmic.dump",
    "--username",
    sourceAdmin,
    sourceDatabase,
  ]);
  run("docker", ["cp", `${sourceContainer}:/tmp/cosmic.dump`, archivePath]);
  const archive = readFileSync(archivePath);
  assert.equal(archive.subarray(0, 5).toString("ascii"), "PGDMP");
  const migration = migrationSet();
  const descriptor = createRecoveryDescriptor({
    archive,
    roleManifest,
    migrationSetSha256: migration.sha256,
    policy,
    sourcePostgresMajor: sourceMajor,
  });
  writeFileSync(descriptorPath, canonicalJson(descriptor));
  validateRecoveryDescriptor({
    archive,
    descriptor,
    roleManifest,
    migrationSetSha256: migration.sha256,
    policy,
  });
  const truncated = archive.subarray(0, Math.max(1, archive.length - 32));
  assert.throws(() =>
    validateRecoveryDescriptor({
      archive: truncated,
      descriptor,
      roleManifest,
      migrationSetSha256: migration.sha256,
      policy,
    }),
  );
  const archiveListing = capture("docker", [
    "exec",
    sourceContainer,
    "pg_restore",
    "--list",
    "/tmp/cosmic.dump",
  ]);
  assert.match(archiveListing, /TABLE public user_account/u);
  assert.match(archiveListing, /TABLE auth user/u);
  assert.match(archiveListing, /TABLE DATA public profile/u);

  const targetPort = startPostgres(
    targetContainer,
    targetAdmin,
    targetBootstrapDatabase,
  );
  const targetBootstrapUrl = databaseUrl(
    targetAdmin,
    targetPort,
    targetBootstrapDatabase,
  );
  targetPool = new Pool({ connectionString: targetBootstrapUrl, max: 2 });
  assert.equal(await postgresMajor(targetPool), policy.postgresMajor);
  await targetPool.query(roleManifestSql(roleManifest, policy));
  await targetPool.query(`CREATE DATABASE ${restoredDatabase}`);
  await targetPool.end();
  targetPool = undefined;

  run("docker", ["cp", archivePath, `${targetContainer}:/tmp/cosmic.dump`]);
  run("docker", [
    "exec",
    targetContainer,
    "pg_restore",
    "--no-owner",
    "--exit-on-error",
    "--single-transaction",
    "--username",
    targetAdmin,
    "--dbname",
    restoredDatabase,
    "/tmp/cosmic.dump",
  ]);

  const restoredUrl = databaseUrl(targetAdmin, targetPort, restoredDatabase);
  targetPool = new Pool({ connectionString: restoredUrl, max: 3 });
  assert.equal(toolMajor(targetContainer, "pg_dump"), policy.postgresMajor);
  assert.equal(toolMajor(targetContainer, "pg_restore"), policy.postgresMajor);
  validateRecoveryDescriptor({
    archive: readFileSync(archivePath),
    descriptor: JSON.parse(readFileSync(descriptorPath, "utf8")),
    roleManifest: JSON.parse(readFileSync(roleManifestPath, "utf8")),
    migrationSetSha256: migration.sha256,
    policy,
  });
  const targetSchema = schemaSnapshot(
    targetContainer,
    targetAdmin,
    restoredDatabase,
  );
  assert.equal(
    targetSchema,
    sourceSchema,
    "restored schema/ACL definition drifted",
  );
  await verifyRestoredDatabase(
    targetPool,
    roleManifest,
    migration,
    sourceMigrationHistory,
  );

  console.log(
    `database recovery drill passed (PostgreSQL ${policy.postgresMajor}, ${migration.count} migrations, schema ${sha256(sourceSchema).slice(0, 19)}..., archive ${descriptor.archiveSha256.slice(0, 19)}..., roles ${descriptor.roleManifestSha256.slice(0, 19)}..., 2 synthetic owners isolated)`,
  );
} finally {
  await Promise.allSettled([sourcePool?.end(), targetPool?.end()]);
  removeContainer(sourceContainer);
  removeContainer(targetContainer);
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function startPostgres(container, administrator, database) {
  capture("docker", [
    "run",
    "--detach",
    "--name",
    container,
    "--publish",
    "127.0.0.1::5432",
    "--tmpfs",
    "/var/lib/postgresql:size=512m",
    "--security-opt",
    "no-new-privileges:true",
    "--env",
    `POSTGRES_DB=${database}`,
    "--env",
    `POSTGRES_USER=${administrator}`,
    "--env",
    `POSTGRES_PASSWORD=${localPassword}`,
    POSTGRES_IMAGE,
  ]);
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = spawnSync("docker", [
      "exec",
      container,
      "pg_isready",
      "--username",
      administrator,
      "--dbname",
      database,
    ]);
    consecutiveReadyChecks =
      result.status === 0 ? consecutiveReadyChecks + 1 : 0;
    if (consecutiveReadyChecks >= 6) break;
    if (attempt === 119)
      throw new Error("disposable PostgreSQL did not remain ready");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  const endpoint = capture("docker", ["port", container, "5432/tcp"]).trim();
  const port = Number(endpoint.slice(endpoint.lastIndexOf(":") + 1));
  assert.ok(Number.isSafeInteger(port) && port > 0);
  return port;
}

function databaseUrl(administrator, port, database) {
  return `postgresql://${administrator}:${localPassword}@127.0.0.1:${port}/${database}`;
}

async function postgresMajor(pool) {
  const result = await pool.query("show server_version_num");
  const version = String(result.rows[0].server_version_num);
  assert.match(version, /^\d{6}$/u);
  return Number(version.slice(0, 2));
}

function toolMajor(container, tool) {
  const version = capture("docker", ["exec", container, tool, "--version"]);
  const match = /\(PostgreSQL\)\s+(\d+)/u.exec(version);
  assert.ok(match, `${tool} version is unrecognized`);
  return Number(match[1]);
}

function schemaSnapshot(container, administrator, database) {
  const deterministicRestrictKey = [
    "b5ec5588c7f9735a0e39effc04e71f0a",
    "5d87a22106becfe4252e572398eea795",
  ].join("");

  return capture("docker", [
    "exec",
    container,
    "pg_dump",
    "--schema-only",
    "--no-owner",
    `--restrict-key=${deterministicRestrictKey}`,
    "--username",
    administrator,
    database,
  ]);
}

async function migrationHistory(pool) {
  const result = await pool.query(
    `select id::text, hash, created_at::text
       from drizzle.__drizzle_migrations order by id`,
  );
  return result.rows;
}

async function readRoleManifest(pool) {
  const result = await pool.query(
    `select rolname as name, rolinherit as inherit, rolcanlogin as "canLogin",
            rolsuper as superuser, rolcreatedb as "createDb",
            rolcreaterole as "createRole", rolreplication as replication,
            rolbypassrls as "bypassRls"
       from pg_roles
      where rolname = any($1::text[])
      order by rolname`,
    [policy.roles.map((role) => role.name)],
  );
  return {
    schema: "astroligyapp.database-role-manifest",
    version: 1,
    postgresMajor: policy.postgresMajor,
    containsPasswords: false,
    authorizing: false,
    roles: result.rows,
  };
}

function migrationSet() {
  const files = readdirSync("drizzle")
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  assert.equal(files.length, policy.migrationCount);
  assert.equal(basename(files.at(-1), ".sql"), policy.latestMigration);
  return {
    count: files.length,
    sha256: sha256(
      files
        .map(
          (name) => `${name}\0${sha256(readFileSync(join("drizzle", name)))}`,
        )
        .join("\n"),
    ),
  };
}

async function seedSyntheticRecoveryData(pool) {
  await pool.query(
    `insert into user_account (id, identity_provider_subject)
     values ($1, 'recovery-owner-a'), ($2, 'recovery-owner-b')`,
    [ownerA, ownerB],
  );
  await pool.query(
    `insert into profile (id, owner_user_id, display_name, current_timezone)
     values ('10000000-0000-4000-8000-0000000000a1', $1, 'Recovery Fixture A', 'America/Toronto'),
            ('10000000-0000-4000-8000-0000000000b2', $2, 'Recovery Fixture B', 'America/Toronto')`,
    [ownerA, ownerB],
  );
  await pool.query(
    `insert into birth_profile
       (id, profile_id, birth_date, timezone, birth_time_precision)
     values
       ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1',
        '2000-01-01', 'America/Toronto', 'date-only'),
       ('20000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-0000000000b2',
        '2001-01-01', 'America/Toronto', 'date-only')`,
  );
  await pool.query(
    `insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
     values ('recovery-owner-a', 'Recovery Auth A', 'recovery-a@example.test', true,
             '2026-08-30T00:00:00Z', '2026-08-30T00:00:00Z'),
            ('recovery-owner-b', 'Recovery Auth B', 'recovery-b@example.test', true,
             '2026-08-30T00:00:00Z', '2026-08-30T00:00:00Z')`,
  );
}

async function verifyRestoredDatabase(
  pool,
  roleManifest,
  migration,
  sourceMigrationHistory,
) {
  const counts = await pool.query(
    `select
       (select count(*)::int from public.user_account) as accounts,
       (select count(*)::int from public.profile) as profiles,
       (select count(*)::int from public.birth_profile) as births,
       (select count(*)::int from auth."user") as auth_users,
       (select count(*)::int from drizzle.__drizzle_migrations) as migrations`,
  );
  assert.deepEqual(counts.rows[0], {
    accounts: 2,
    profiles: 2,
    births: 2,
    auth_users: 2,
    migrations: migration.count,
  });

  const tables = await pool.query(
    `select n.nspname as schema, count(*)::int as count
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public', 'auth')
      group by n.nspname order by n.nspname`,
  );
  assert.deepEqual(tables.rows, [
    { schema: "auth", count: policy.expectedAuthTableCount },
    { schema: "public", count: policy.expectedPublicTableCount },
  ]);
  const forced = await pool.query(
    `select count(*)::int as count
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname = 'public'
        and c.relrowsecurity and c.relforcerowsecurity`,
  );
  assert.equal(forced.rows[0].count, policy.expectedForcedRlsTableCount);
  const unsafeOwners = await pool.query(
    `select count(*)::int as count
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       join pg_roles r on r.oid = c.relowner
      where n.nspname in ('public', 'auth', 'app', 'drizzle')
        and r.rolname like 'app_%'`,
  );
  assert.equal(unsafeOwners.rows[0].count, 0);
  const unsafeRoleState = await pool.query(
    `select
       (select count(*)::int from pg_authid
         where rolname ~ '^app_' and rolpassword is not null) as passwords,
       (select count(*)::int from pg_auth_members m
          join pg_roles member_role on member_role.oid = m.member
         where member_role.rolname = $1) as target_admin_memberships`,
    [targetAdmin],
  );
  assert.deepEqual(unsafeRoleState.rows[0], {
    passwords: 0,
    target_admin_memberships: 0,
  });
  assert.deepEqual(await migrationHistory(pool), sourceMigrationHistory);
  validateRoleManifest(await readRoleManifest(pool), policy);
  assert.deepEqual(await visibleProfiles(pool, null), []);
  assert.deepEqual(await visibleProfiles(pool, ownerA), ["Recovery Fixture A"]);
  assert.deepEqual(await visibleProfiles(pool, ownerB), ["Recovery Fixture B"]);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role app_user");
    await client.query("select set_config('app.current_user_id', $1, true)", [
      ownerA,
    ]);
    const crossUpdate = await client.query(
      "update profile set display_name='Forbidden' where owner_user_id=$1",
      [ownerB],
    );
    assert.equal(crossUpdate.rowCount, 0);
    await assert.rejects(
      client.query(
        `insert into profile (owner_user_id, display_name, current_timezone)
         values ($1, 'Forbidden', 'America/Toronto')`,
        [ownerB],
      ),
      (error) => error?.code === "42501",
    );
    await client.query("rollback");
  } finally {
    client.release();
  }

  const authClient = await pool.connect();
  try {
    await authClient.query("begin");
    await authClient.query("set local role app_user");
    await assert.rejects(
      authClient.query('select id from auth."user"'),
      (error) => error?.code === "42501",
    );
    await authClient.query("rollback");
  } finally {
    authClient.release();
  }

  assert.equal(roleManifest.roles.length, policy.roles.length);
}

async function visibleProfiles(pool, owner) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role app_user");
    if (owner) {
      await client.query("select set_config('app.current_user_id', $1, true)", [
        owner,
      ]);
    }
    const result = await client.query(
      "select display_name from profile order by display_name",
    );
    await client.query("rollback");
    return result.rows.map((row) => row.display_name);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function run(command, args, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const diagnostic = String(result.stderr ?? "")
      .replaceAll(localPassword, "[redacted]")
      .trim()
      .slice(0, 1_000);
    throw new Error(
      `${command} failed with ${result.status}${diagnostic ? `: ${diagnostic}` : ""}`,
    );
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const diagnostic = String(result.stderr ?? "")
      .replaceAll(localPassword, "[redacted]")
      .trim()
      .slice(0, 1_000);
    throw new Error(
      `${command} failed with ${result.status}${diagnostic ? `: ${diagnostic}` : ""}`,
    );
  }
  return result.stdout;
}

function removeContainer(container) {
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
}
