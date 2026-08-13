export const GLOBAL_BROWSER_SECURITY_HEADERS = Object.freeze({
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
  "X-DNS-Prefetch-Control": "off",
});

export const PRIVATE_NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
});

export const STRICT_API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export const STRICT_SHARE_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'self'; img-src 'none'; font-src 'none'; script-src 'none'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function nextHeaders(
  values: Readonly<Record<string, string>>,
): Array<{ key: string; value: string }> {
  return Object.entries(values).map(([key, value]) => ({ key, value }));
}
