import { readFile } from "node:fs/promises";

try {
  process.kill(1, 0);
  const command = await readFile("/proc/1/cmdline", "utf8");
  if (!command.includes("/usr/local/bin/node\0worker.mjs"))
    throw new Error("unexpected process");
} catch {
  process.exitCode = 1;
}
