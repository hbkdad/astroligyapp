import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const composeFile = "docker-compose.runtime.test.yml";
const deploymentId = "goal80-local-runtime";
const environment = {
  ...process.env,
  NEXT_DEPLOYMENT_ID: deploymentId,
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};

try {
  run("docker", [
    "build",
    "--build-arg",
    `NEXT_DEPLOYMENT_ID=${deploymentId}`,
    "--secret",
    "id=next_server_actions_encryption_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
    "--tag",
    "astroligyapp:goal80",
    ".",
  ]);
  compose(["up", "-d", "--wait"]);

  const firstPage = await expectStatus(
    "http://127.0.0.1:3101/horoscope/aries",
    200,
  );
  const secondPage = await expectStatus(
    "http://127.0.0.1:3102/horoscope/aries",
    200,
  );
  for (const response of [firstPage, secondPage]) {
    const body = await response.text();
    if (
      !body.includes(`data-dpl-id="${deploymentId}"`) ||
      !body.includes(`?dpl=${deploymentId}`)
    )
      throw new Error(
        "deployment identity is absent from the optimized response",
      );
    expectSecurityHeaders(response);
  }
  await expectStatus("http://127.0.0.1:3101/api/health", 200);
  await expectStatus("http://127.0.0.1:3102/api/health", 200);
  const spoofed = await fetch("http://127.0.0.1:3101/", {
    headers: {
      forwarded: "host=evil.example;proto=http",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    },
  });
  if (spoofed.status !== 200 || (await spoofed.text()).includes("evil.example"))
    throw new Error("untrusted forwarded host affected the public response");
  expectSecurityHeaders(spoofed);
  const privateShare = await fetch("http://127.0.0.1:3102/match/invalid-token");
  if (
    privateShare.status !== 404 ||
    !/private/u.test(privateShare.headers.get("cache-control") ?? "")
  )
    throw new Error(
      "private share failure did not remain private and fail closed",
    );

  const hardening = run(
    "docker",
    [
      "inspect",
      "astroligyapp-runtime-test-app-one-1",
      "astroligyapp-runtime-test-app-two-1",
      "--format",
      "{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}|{{.State.Health.Status}}",
    ],
    true,
  );
  const hardeningLines = hardening.trim().split(/\r?\n/u);
  if (
    hardeningLines.length !== 2 ||
    hardeningLines.some((line) => line !== "nonroot|true|healthy")
  ) {
    throw new Error(
      "runtime containers are not non-root, read-only, and healthy",
    );
  }

  compose([
    "exec",
    "-T",
    "app-one",
    "node",
    "-e",
    "const H=require('./cache-handler.cjs');const h=new H();h.set('goal80-probe',{kind:'FETCH',data:{body:'shared-value'},revalidate:60},{tags:['goal80-tag']}).then(()=>process.exit(0),()=>process.exit(1))",
  ]);
  const shared = compose(
    [
      "exec",
      "-T",
      "app-two",
      "node",
      "-e",
      "const H=require('./cache-handler.cjs');const h=new H();h.get('goal80-probe',{tags:['goal80-tag']}).then(v=>{console.log(v?.value?.data?.body??'MISS');process.exit(v?0:1)},()=>process.exit(2))",
    ],
    true,
  );
  if (shared.trim() !== "shared-value")
    throw new Error("cross-instance cache read failed");

  await new Promise((resolve) => setTimeout(resolve, 5));
  compose([
    "exec",
    "-T",
    "app-two",
    "node",
    "-e",
    "const H=require('./cache-handler.cjs');const h=new H();h.revalidateTag('goal80-tag').then(()=>process.exit(0),()=>process.exit(1))",
  ]);
  const invalidated = compose(
    [
      "exec",
      "-T",
      "app-one",
      "node",
      "-e",
      "const H=require('./cache-handler.cjs');const h=new H();h.get('goal80-probe',{tags:['goal80-tag']}).then(v=>{console.log(v?'HIT':'MISS');process.exit(v?1:0)},()=>process.exit(2))",
    ],
    true,
  );
  if (invalidated.trim() !== "MISS")
    throw new Error("cross-instance invalidation failed");

  compose(["stop", "valkey"]);
  await expectStatus("http://127.0.0.1:3101/horoscope/aries", 200);
  await expectStatus("http://127.0.0.1:3102/api/health", 200);

  run("docker", [
    "stop",
    "--timeout",
    "10",
    "astroligyapp-runtime-test-app-one-1",
  ]);
  const exitCode = run(
    "docker",
    [
      "inspect",
      "astroligyapp-runtime-test-app-one-1",
      "--format",
      "{{.State.ExitCode}}",
    ],
    true,
  ).trim();
  if (exitCode !== "143" && exitCode !== "0")
    throw new Error(`unexpected SIGTERM exit code ${exitCode}`);

  console.log(
    "runtime topology passed: two tasks, PostgreSQL 18, Valkey coordination, outage, and SIGTERM",
  );
} finally {
  compose(["down", "--volumes"], false, true);
}

function compose(arguments_, capture = false, tolerateFailure = false) {
  return run(
    "docker",
    ["compose", "-f", composeFile, ...arguments_],
    capture,
    tolerateFailure,
  );
}

function run(command, arguments_, capture = false, tolerateFailure = false) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !tolerateFailure) {
    throw new Error(
      `${command} ${arguments_.join(" ")} failed with ${result.status}\n${result.stderr}`,
    );
  }
  return result.stdout ?? "";
}

async function expectStatus(url, expected) {
  const response = await fetch(url);
  if (response.status !== expected)
    throw new Error(
      `${new URL(url).pathname} returned ${response.status}, expected ${expected}`,
    );
  return response;
}

function expectSecurityHeaders(response) {
  const expected = {
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
  for (const [name, value] of Object.entries(expected)) {
    if (response.headers.get(name) !== value)
      throw new Error(`${name} is missing from runtime response`);
  }
  if (response.headers.has("x-powered-by"))
    throw new Error("runtime response exposes X-Powered-By");
}
