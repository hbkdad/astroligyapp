import { spawnSync } from "node:child_process";

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--volume",
    "/var/run/docker.sock:/var/run/docker.sock",
    "aquasec/trivy@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c",
    "image",
    "--scanners",
    "vuln,secret",
    "--severity",
    "HIGH,CRITICAL",
    "--ignore-unfixed",
    "--exit-code",
    "1",
    "--quiet",
    "astroligyapp:goal80",
  ],
  { cwd: process.cwd(), stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
