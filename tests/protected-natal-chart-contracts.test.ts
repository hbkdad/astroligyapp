import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PROTECTED_NATAL_CHART_CONTRACT_VERSION,
  validateProtectedNatalChartCommand,
  validateProtectedNatalChartProfileView,
} from "@/server/protected-natal-chart-contracts";
import { DEMO_NATAL_CHART } from "@/presentation/natal-chart-demo";

const command = {
  version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
  profileId: "10000000-0000-4000-8000-000000000001",
  birthProfileId: "20000000-0000-4000-8000-000000000001",
  revision: 1,
};

describe("protected natal chart contracts", () => {
  it("accepts and freezes the exact opaque-resource command", () => {
    const result = validateProtectedNatalChartCommand(command);
    expect(result).toEqual(command);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    { ...command, ownerId: "30000000-0000-4000-8000-000000000001" },
    { ...command, birthDate: "1990-01-01" },
    { ...command, timezone: "UTC" },
    { ...command, entitlement: "personal" },
    { ...command, revision: 0 },
    { ...command, profileId: "not-a-uuid" },
    { ...command, version: "2.0.0" },
  ])(
    "rejects identity, birth input, entitlement, or malformed fields %#",
    (value) => {
      expect(validateProtectedNatalChartCommand(value)).toBeNull();
    },
  );

  it("validates and deeply freezes the minimal protected read projection", () => {
    const result = validateProtectedNatalChartProfileView({
      profileId: command.profileId,
      birthProfileId: command.birthProfileId,
      revision: 1,
      displayName: "Mira",
      timePrecision: "exact",
      readiness: "ready",
      generationAllowed: true,
      chartStale: false,
      chart: DEMO_NATAL_CHART,
    });
    expect(result?.chart?.placements).toHaveLength(10);
    expect(Object.isFrozen(result?.chart?.placements)).toBe(true);
    expect(
      validateProtectedNatalChartProfileView({
        ...result,
        chart: {
          ...DEMO_NATAL_CHART,
          placements: [
            { ...DEMO_NATAL_CHART.placements[0], internalId: "leak" },
            ...DEMO_NATAL_CHART.placements.slice(1),
          ],
        },
      }),
    ).toBeNull();
  });
});
