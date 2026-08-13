import { isIP } from "node:net";

const deploymentId = required("NEXT_DEPLOYMENT_ID", 7, 128);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]+$/.test(deploymentId))
  invalid("NEXT_DEPLOYMENT_ID");

const encryptionKey = required("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", 24, 64);
let encryptionBytes;
try {
  encryptionBytes = Buffer.from(encryptionKey, "base64");
} catch {
  invalid("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY");
}
if (
  ![16, 24, 32].includes(encryptionBytes.length) ||
  encryptionBytes.toString("base64").replace(/=+$/u, "") !==
    encryptionKey.replace(/=+$/u, "")
)
  invalid("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY");

if (process.env.NEXT_SHARED_CACHE_ENABLED !== "true") {
  throw new Error(
    "NEXT_SHARED_CACHE_ENABLED must be true for the production container",
  );
}

const cacheUrl = new URL(required("NEXT_SHARED_CACHE_URL", 12, 2048));
const localInsecure =
  process.env.NEXT_SHARED_CACHE_ALLOW_INSECURE_LOCAL === "true";
const localHost =
  cacheUrl.hostname === "localhost" ||
  cacheUrl.hostname === "valkey" ||
  isIP(cacheUrl.hostname) !== 0;
if (
  cacheUrl.protocol !== "rediss:" &&
  !(localInsecure && localHost && cacheUrl.protocol === "redis:")
) {
  throw new Error(
    "NEXT_SHARED_CACHE_URL must use TLS outside an explicitly enabled local topology",
  );
}

const taskMaximum = integer("APP_TASK_MAX_COUNT", 1, 20);
const databaseMaximum = integer("DATABASE_MAX_CONNECTIONS", 64, 5_000);
const databaseReserve = integer(
  "DATABASE_RESERVED_CONNECTIONS",
  10,
  databaseMaximum - 1,
);
const poolSlotsPerTask = 32;
if (taskMaximum * poolSlotsPerTask + databaseReserve > databaseMaximum) {
  throw new Error(
    "database connection budget is exceeded by the configured task maximum",
  );
}

console.log("runtime configuration valid");

function required(name, minimum, maximum) {
  const value = process.env[name];
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    /[\0\r\n]/u.test(value)
  )
    invalid(name);
  return value;
}

function invalid(name) {
  throw new Error(`${name} is missing or invalid`);
}

function integer(name, minimum, maximum) {
  const value = required(name, 1, 5);
  if (!/^[0-9]+$/u.test(value)) invalid(name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    invalid(name);
  return parsed;
}
