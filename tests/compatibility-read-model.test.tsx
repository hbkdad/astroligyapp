import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompatibilityView } from "@/components/compatibility-view";
import {
  DEMO_COMPATIBILITY,
  DEMO_COMPATIBILITY_REPORT,
} from "@/presentation/compatibility-demo";
import {
  COMPATIBILITY_READ_MODEL_VERSION,
  toCompatibilityReadModel,
} from "@/presentation/compatibility-read-model";

describe("compatibility presentation boundary", () => {
  it("maps five scored categories and every paired rendered contribution", () => {
    expect(DEMO_COMPATIBILITY.version).toBe(COMPATIBILITY_READ_MODEL_VERSION);
    expect(
      DEMO_COMPATIBILITY.categories.map((item) => [item.id, item.score]),
    ).toEqual([
      ["attraction", 60],
      ["communication", 48],
      ["emotional", 50],
      ["long-term", 52],
      ["chemistry", 66],
    ]);
    expect(DEMO_COMPATIBILITY.items).toHaveLength(12);
    expect(DEMO_COMPATIBILITY.items[0]).toMatchObject({
      categoryLabel: "Attraction",
      toneLabel: "Supportive",
      impactText: "+4 configured impact",
      factStatus: "rendered",
      reflectionStatus: "rendered",
    });
    expect(Object.isFrozen(DEMO_COMPATIBILITY)).toBe(true);
  });

  it("renders semantic score equivalents, separated copy, source IDs, and trace", () => {
    const html = renderToStaticMarkup(
      <CompatibilityView
        state={{ status: "ready", model: DEMO_COMPATIBILITY }}
      />,
    );
    expect(html).toContain('<main id="compatibility-content"');
    expect(html).toContain("Attraction: 60 out of 100");
    expect(
      html.match(/<p class="section-kicker">Calculated fact<\/p>/g),
    ).toHaveLength(12);
    expect(
      html.match(/<p class="section-kicker">Tradition-framed reflection<\/p>/g),
    ).toHaveLength(12);
    expect(html).toContain("synastry:chart-a:sun:chart-b:venus:trine");
    expect(html).toContain("View report versions");
    expect(html).not.toContain("private local demo timezone source");
  });

  it.each([
    { status: "loading" as const },
    { status: "unavailable" as const, message: "Source unavailable." },
    { status: "locked" as const, message: "Sign in required." },
    { status: "error" as const, message: "Try later." },
    { status: "empty" as const, message: "No matching factors." },
    { status: "unsupported" as const, message: "Content unavailable." },
  ])("renders the $status state deliberately", (state) => {
    const html = renderToStaticMarkup(<CompatibilityView state={state} />);
    expect(html).toContain(state.status === "loading" ? "polite" : "assertive");
    expect(html).toContain("Compatibility");
  });

  it("fails closed on report, contribution order, and rendered provenance drift", () => {
    const version = structuredClone(DEMO_COMPATIBILITY_REPORT);
    (version as unknown as { version: string }).version = "2.0.0";
    expect(() => toCompatibilityReadModel(version)).toThrow(
      "invalid for presentation",
    );

    const order = structuredClone(DEMO_COMPATIBILITY_REPORT);
    (order.scores.categories as unknown as unknown[]).reverse();
    expect(() => toCompatibilityReadModel(order)).toThrow();

    const provenance = structuredClone(DEMO_COMPATIBILITY_REPORT);
    (
      provenance.rendered.items[0]!.fact.provenance as unknown as {
        ruleId: string;
      }
    ).ruleId = "unknown";
    expect(() => toCompatibilityReadModel(provenance)).toThrow();
  });
});
