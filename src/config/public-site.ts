export const PUBLIC_SITE_CONFIGURATION_VERSION = "1.0.0";
export const INDEXABLE_PUBLIC_PATHS = [
  "/astrology",
  "/moon-phase",
  "/numerology/life-path",
] as const;

export interface PublicSiteConfiguration {
  readonly version: typeof PUBLIC_SITE_CONFIGURATION_VERSION;
  readonly origin: string;
  readonly indexingEnabled: boolean;
}

export function loadPublicSiteConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PublicSiteConfiguration {
  const enabled = environment.PUBLIC_SITE_INDEXING_ENABLED === "true";
  if (
    environment.PUBLIC_SITE_INDEXING_ENABLED !== undefined &&
    !["true", "false"].includes(environment.PUBLIC_SITE_INDEXING_ENABLED)
  )
    throw new TypeError("Public indexing configuration is invalid");
  const origin = environment.PUBLIC_SITE_ORIGIN ?? "http://localhost:3000";
  const parsed = new URL(origin);
  if (
    parsed.origin !== origin ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    (enabled && parsed.protocol !== "https:") ||
    (!enabled && !["http:", "https:"].includes(parsed.protocol))
  )
    throw new TypeError("Public site origin is invalid");
  return Object.freeze({
    version: PUBLIC_SITE_CONFIGURATION_VERSION,
    origin,
    indexingEnabled: enabled,
  });
}

export function publicUrl(
  path: string,
  config = loadPublicSiteConfiguration(),
) {
  if (path !== "/sitemap.xml" && !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/.test(path))
    throw new TypeError("Public path is invalid");
  return new URL(path, `${config.origin}/`).toString();
}
