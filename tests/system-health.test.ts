import { describe, expect, it } from "vitest";

import { getSystemHealth, SYSTEM_HEALTH } from "@/application/system-health";

describe("getSystemHealth", () => {
  it("returns a stable, immutable readiness payload", () => {
    expect(getSystemHealth()).toBe(SYSTEM_HEALTH);
    expect(getSystemHealth()).toEqual({
      status: "ok",
      service: "personal-cosmic-calendar",
      architectureVersion: "1",
    });
    expect(Object.isFrozen(getSystemHealth())).toBe(true);
  });
});
