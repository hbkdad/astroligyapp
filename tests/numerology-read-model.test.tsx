import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NumerologyView } from "@/components/numerology-view";
import {
  DEMO_NUMEROLOGY,
  DEMO_NUMEROLOGY_SOURCE,
} from "@/presentation/numerology-demo";
import {
  NUMEROLOGY_READ_MODEL_VERSION,
  toNumerologyReadModel,
} from "@/presentation/numerology-read-model";

describe("numerology presentation boundary", () => {
  it("maps six traced core results and three explicit cycle boundaries", () => {
    expect(DEMO_NUMEROLOGY).toMatchObject({
      version: NUMEROLOGY_READ_MODEL_VERSION,
      subtitle: "Pythagoras · born July 15, 1990",
    });
    expect(DEMO_NUMEROLOGY.core.map((item) => [item.key, item.value])).toEqual([
      ["life-path", 5],
      ["expression", 4],
      ["soul-urge", 8],
      ["personality", 5],
      ["birthday", 6],
      ["maturity", 9],
    ]);
    expect(DEMO_NUMEROLOGY.cycles.map((item) => item.value)).toEqual([6, 8, 1]);
    expect(
      DEMO_NUMEROLOGY.core.every(
        (item) => item.tokenLabel && item.operations.length,
      ),
    ).toBe(true);
    expect(Object.isFrozen(DEMO_NUMEROLOGY)).toBe(true);
  });

  it("renders semantic traced results, cycle table, convention, and no meaning copy", () => {
    const html = renderToStaticMarkup(
      <NumerologyView state={{ status: "ready", model: DEMO_NUMEROLOGY }} />,
    );
    expect(html).toContain('<main id="numerology-content"');
    expect(html).toContain("master numbers 11, 22, and 33 are preserved");
    expect(html).toContain("Y is treated as a consonant");
    expect(html.match(/View calculation trace/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Personal numerology cycle table"');
    expect(html).toContain("No traditional meaning is added");
  });

  it.each([
    { status: "loading" as const },
    { status: "unavailable" as const, message: "Input unavailable." },
    { status: "locked" as const, message: "Sign in." },
    { status: "error" as const, message: "Try later." },
  ])("renders the $status state", (state) => {
    const html = renderToStaticMarkup(<NumerologyView state={state} />);
    expect(html).toContain(state.status === "loading" ? "polite" : "assertive");
  });

  it("renders a deliberate empty cycle state", () => {
    const model = structuredClone(DEMO_NUMEROLOGY);
    (model as unknown as { cycles: unknown[] }).cycles = [];
    expect(
      renderToStaticMarkup(
        <NumerologyView state={{ status: "ready", model }} />,
      ),
    ).toContain("No explicit personal-cycle boundaries");
  });

  it("fails closed on strategy, result trace, and cycle ordering corruption", () => {
    const strategy = structuredClone(DEMO_NUMEROLOGY_SOURCE);
    (strategy as { strategyVersion: string }).strategyVersion = "wrong";
    expect(() => toNumerologyReadModel(strategy)).toThrow("trace is invalid");

    const trace = structuredClone(DEMO_NUMEROLOGY_SOURCE);
    (trace.core["life-path"].trace as unknown as unknown[]).splice(0);
    expect(() => toNumerologyReadModel(trace)).toThrow("trace is invalid");

    const order = structuredClone(DEMO_NUMEROLOGY_SOURCE);
    (order.timeline.facts as unknown as unknown[]).reverse();
    expect(() => toNumerologyReadModel(order)).toThrow(
      "cycle facts are invalid",
    );
  });
});
