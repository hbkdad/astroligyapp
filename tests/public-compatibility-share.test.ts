import { describe, expect, it } from "vitest";
import {
  PUBLIC_COMPATIBILITY_SHARE_VERSION,
  projectPublicCompatibilityShare,
} from "@/application/project-public-compatibility-share";
import { DEMO_COMPATIBILITY_REPORT } from "@/presentation/compatibility-demo";

describe("public compatibility share projection", () => {
  it("publishes only selected scores and paired rendered copy", () => {
    const share = projectPublicCompatibilityShare(DEMO_COMPATIBILITY_REPORT);
    expect(share.version).toBe(PUBLIC_COMPATIBILITY_SHARE_VERSION);
    expect(share.locale).toBe("en-CA");
    expect(share.categories.map(({ key, score }) => [key, score])).toEqual([
      ["attraction", 60],
      ["communication", 48],
      ["emotional", 50],
      ["long-term", 52],
      ["chemistry", 66],
    ]);
    expect(share.factors).toHaveLength(12);
    expect(share.factors[0]).toMatchObject({
      publicId: "factor-01",
      categoryKey: "attraction",
      tone: "supportive",
      impact: 4,
      fact: { status: "rendered" },
      reflection: { status: "rendered" },
    });
    expect(Object.isFrozen(share)).toBe(true);
    expect(Object.isFrozen(share.factors[0])).toBe(true);
  });

  it("redacts private inputs, calculation data, provenance, and internal IDs", () => {
    const share = projectPublicCompatibilityShare(DEMO_COMPATIBILITY_REPORT);
    const serialized = JSON.stringify(share);
    const forbiddenKeys = new Set([
      "aggregate",
      "scores",
      "projection",
      "rendered",
      "sourceVersions",
      "sourceFactId",
      "ruleId",
      "projectionItemId",
      "provenance",
      "placements",
      "houses",
      "aspects",
      "longitudeDegrees",
      "speedLongitudeDegreesPerDay",
      "cuspLongitudeDegrees",
      "birthInstant",
      "latitudeDegrees",
      "longitudeDegrees",
      "accountId",
      "profileId",
      "token",
      "tokenDigest",
    ]);
    walkKeys(share, (key) => expect(forbiddenKeys).not.toContain(key));
    expect(serialized).not.toContain("synastry:chart-a");
    expect(serialized).not.toContain("private local demo timezone source");
    expect(serialized).not.toContain("local-demo-a");
    expect(serialized).not.toContain("local-demo-b");
    expect(serialized).not.toContain("local-demo-private");
    expect(serialized).not.toContain('"PRIVATE"');
    expect(serialized).not.toContain("initial-compatibility-categories");
  });

  it("is deterministic and fails closed on report or provenance tampering", () => {
    expect(projectPublicCompatibilityShare(DEMO_COMPATIBILITY_REPORT)).toEqual(
      projectPublicCompatibilityShare(DEMO_COMPATIBILITY_REPORT),
    );

    const report = structuredClone(DEMO_COMPATIBILITY_REPORT);
    (
      report.rendered.items[0]!.fact.provenance as unknown as {
        ruleId: string;
      }
    ).ruleId = "substitute-rule";
    expect(() => projectPublicCompatibilityShare(report)).toThrow(
      "invalid for public sharing",
    );

    const unknown = structuredClone(
      DEMO_COMPATIBILITY_REPORT,
    ) as unknown as Record<string, unknown>;
    unknown.public = true;
    expect(() =>
      projectPublicCompatibilityShare(
        unknown as unknown as typeof DEMO_COMPATIBILITY_REPORT,
      ),
    ).toThrow("invalid for public sharing");
  });
});

function walkKeys(value: unknown, inspect: (key: string) => void): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    inspect(key);
    walkKeys(child, inspect);
  }
}
