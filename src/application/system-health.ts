export const SYSTEM_HEALTH = Object.freeze({
  status: "ok",
  service: "personal-cosmic-calendar",
  architectureVersion: "1",
} as const);

export function getSystemHealth() {
  return SYSTEM_HEALTH;
}
