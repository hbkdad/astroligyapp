import { describe, expect, it } from "vitest";

import {
  PERSONAL_TIMELINE_ENGINE_VERSION,
  PersonalTimelineEngine,
} from "@/application/calculate-personal-timeline";
import type { TimelineFact } from "@/application/compose-timeline-facts";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { ZOLLIKON_NATAL_CHART_DEMO } from "@/presentation/natal-chart-demo";

describe("PersonalTimelineEngine", () => {
  it("calculates a bounded, ordered, reproducible personal forecast", async () => {
    const result = await new PersonalTimelineEngine(
      new AstronomyEngineProvider(),
    ).calculate(ZOLLIKON_NATAL_CHART_DEMO, {
      startInstant: "2000-01-01T00:00:00.000Z",
      endInstant: "2000-01-16T00:00:00.000Z",
      birthDate: "1997-09-30",
      scope: "forecast",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.input.effectiveEndInstant).toBe(
      "2000-01-15T00:00:00.000Z",
    );
    expect(result.value.metadata).toMatchObject({
      engineVersion: PERSONAL_TIMELINE_ENGINE_VERSION,
      truncated: true,
      truncationReasons: ["plan-interval", "boundary-window"],
      coarseObservationCount: 29,
    });
    expect(result.value.metadata.providerPositionCallCount).toBeGreaterThan(0);
    expect(result.value.timeline.facts.length).toBeGreaterThan(0);
    expect(
      result.value.timeline.facts.every(
        (fact, index, facts) =>
          index === 0 || occurrence(facts[index - 1]!) <= occurrence(fact),
      ),
    ).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("rejects malformed intervals and birth dates before provider dispatch", async () => {
    const provider = new AstronomyEngineProvider();
    const result = await new PersonalTimelineEngine(provider).calculate(
      ZOLLIKON_NATAL_CHART_DEMO,
      {
        startInstant: "2000-01-01T00:00:00.000Z",
        endInstant: "2000-01-02T00:00:00.000Z",
        birthDate: "not-a-date",
        scope: "forecast",
      },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid-input",
        message: "Personal timeline input is invalid",
        retryable: false,
      },
    });
  });
});

function occurrence(fact: TimelineFact) {
  return Date.parse(
    fact.occurrence.kind === "instant"
      ? fact.occurrence.instant
      : fact.occurrence.startInstant,
  );
}
