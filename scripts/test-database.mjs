import { spawnSync } from "node:child_process";

const projectName = "astroligyapp_goal2_test";
const composeArgs = [
  "compose",
  "--project-name",
  projectName,
  "--file",
  "docker-compose.test.yml",
];
const testDatabaseUrl =
  "postgresql://cosmic:cosmic_local_only@127.0.0.1:55432/cosmic";

function run(command, args, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}`,
    );
  }
}

try {
  run("docker", [...composeArgs, "up", "--detach", "--wait"]);
  run(process.execPath, ["scripts/test-compatibility-migration.mjs"], {
    TEST_DATABASE_URL: testDatabaseUrl,
  });
  run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "migrate"], {
    DATABASE_URL: testDatabaseUrl,
  });
  run(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.database.config.ts",
    ],
    {
      TEST_DATABASE_URL: testDatabaseUrl,
    },
  );
} finally {
  run("docker", [...composeArgs, "down", "--remove-orphans"]);
}
