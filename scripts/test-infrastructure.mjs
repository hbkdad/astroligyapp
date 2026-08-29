import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const disposableRoot = mkdtempSync(join(tmpdir(), "astroligyapp-iac-"));
const disposableInfrastructure = join(disposableRoot, "aws");
const tofuImage =
  "ghcr.io/opentofu/opentofu@sha256:ba827d1af675c3f522eb78e2b8098cc87daefb9ceb9d3c4b69d0a1bb6d272463";
const tflintImage =
  "ghcr.io/terraform-linters/tflint@sha256:1c595f42d794c32c45a6ea8b58655fd66433d4ca3b1bc631c574a48d120bd19f";
const conftestImage =
  "openpolicyagent/conftest@sha256:a38ba21668929a00dce2fe6ee43d1312228340bce5fd243f47dd0ce90516e558";
const trivyImage =
  "aquasec/trivy@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c";
const encryption =
  'key_provider "pbkdf2" "ci" { passphrase = "credential-free-disposable-test-key-not-for-state" } method "aes_gcm" "ci" { keys = key_provider.pbkdf2.ci } state { method = method.aes_gcm.ci } plan { method = method.aes_gcm.ci }';

try {
  cpSync(join(root, "infra", "aws"), disposableInfrastructure, {
    recursive: true,
    filter: (source) => basename(source) !== ".terraform",
  });

  run("docker", [
    "run",
    "--rm",
    ...containerUserArguments(),
    "-e",
    `TF_ENCRYPTION=${encryption}`,
    "-v",
    `${disposableInfrastructure}:/workspace`,
    "-w",
    "/workspace",
    tofuImage,
    "fmt",
    "-recursive",
    "-check",
    "-diff",
  ]);
  run("docker", [
    "run",
    "--rm",
    ...containerUserArguments(),
    "-e",
    `TF_ENCRYPTION=${encryption}`,
    "-v",
    `${disposableInfrastructure}:/workspace`,
    "-w",
    "/workspace",
    tofuImage,
    "init",
    "-backend=false",
    "-input=false",
    "-lockfile=readonly",
    "-no-color",
  ]);
  run("docker", [
    "run",
    "--rm",
    ...containerUserArguments(),
    "-e",
    `TF_ENCRYPTION=${encryption}`,
    "-v",
    `${disposableInfrastructure}:/workspace`,
    "-w",
    "/workspace",
    tofuImage,
    "validate",
    "-no-color",
  ]);
  run("docker", [
    "run",
    "--rm",
    ...containerUserArguments(),
    "-e",
    `TF_ENCRYPTION=${encryption}`,
    "-v",
    `${disposableInfrastructure}:/workspace`,
    "-w",
    "/workspace",
    tofuImage,
    "test",
    "-no-color",
  ]);
  run("docker", [
    "run",
    "--rm",
    "-v",
    `${disposableInfrastructure}:/workspace`,
    "-w",
    "/workspace",
    tflintImage,
    "--config=/workspace/.tflint.hcl",
    "--recursive",
    "--filter=*.tf",
    "--filter=modules/**/*.tf",
    "--minimum-failure-severity=warning",
  ]);

  const terraformFiles = terraformPaths(disposableInfrastructure).filter(
    (path) => !path.includes("policy-fixtures"),
  );
  run("docker", [
    "run",
    "--rm",
    "-v",
    `${disposableInfrastructure}:/workspace`,
    "-w",
    "/workspace",
    conftestImage,
    "test",
    "--all-namespaces",
    "--parser",
    "hcl2",
    "--policy",
    "policy",
    ...terraformFiles,
  ]);
  const unsafe = run(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${disposableInfrastructure}:/workspace`,
      "-w",
      "/workspace",
      conftestImage,
      "test",
      "--all-namespaces",
      "--parser",
      "hcl2",
      "--policy",
      "policy",
      "policy-fixtures/unsafe.hcl",
    ],
    true,
  );
  if (!unsafe.stdout.includes("8 tests, 0 passed, 0 warnings, 8 failures")) {
    throw new Error(
      "policy rejection fixture did not produce all eight expected failures",
    );
  }

  run("docker", [
    "run",
    "--rm",
    "-v",
    `${disposableInfrastructure}:/workspace`,
    "-w",
    "/workspace",
    trivyImage,
    "config",
    "--skip-dirs",
    ".terraform",
    "--skip-dirs",
    "policy-fixtures",
    "--severity",
    "HIGH,CRITICAL",
    "--exit-code",
    "1",
    ".",
  ]);
  run(process.execPath, [
    join(root, "scripts", "validate-infrastructure-contract.mjs"),
  ]);
  console.log("credential-free infrastructure gate passed");
} finally {
  rmSync(disposableRoot, { recursive: true, force: true });
}

function run(command, args, expectFailure = false) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: sanitizedEnvironment(),
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (expectFailure ? result.status === 0 : result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
  return result;
}

function terraformPaths(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    return entry.isDirectory()
      ? terraformPaths(absolutePath, relativePath)
      : entry.name.endsWith(".tf")
        ? [relativePath]
        : [];
  });
}

function sanitizedEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("AWS_") && name !== "TF_ENCRYPTION",
    ),
  );
}

function containerUserArguments() {
  return typeof process.getuid === "function" &&
    typeof process.getgid === "function"
    ? ["--user", `${process.getuid()}:${process.getgid()}`]
    : [];
}
