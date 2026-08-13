import { describe, expect, it, vi } from "vitest";

import {
  AggregateCalculationPerformanceSink,
  CALCULATION_PERFORMANCE_VERSION,
  recordCalculationPerformance,
} from "@/application/calculation-performance";

describe("privacy-safe calculation performance aggregation", () => {
  it("aggregates only fixed flow/outcome counters, durations, and provider calls", () => {
    const sink = new AggregateCalculationPerformanceSink();
    sink.record({
      version: CALCULATION_PERFORMANCE_VERSION,
      flow: "public-lunar",
      outcome: "miss",
      durationMilliseconds: 12.5,
      providerPositionCallCount: 31,
    });
    sink.record({
      version: CALCULATION_PERFORMANCE_VERSION,
      flow: "public-lunar",
      outcome: "miss",
      durationMilliseconds: 7.5,
      providerPositionCallCount: 29,
    });
    expect(sink.snapshot()).toEqual([
      {
        flow: "public-lunar",
        outcome: "miss",
        count: 2,
        totalDurationMilliseconds: 20,
        maximumDurationMilliseconds: 12.5,
        providerPositionCallCount: 60,
      },
    ]);
    expect(JSON.stringify(sink.snapshot())).not.toMatch(
      /date|account|owner|profile|birth|cacheKey/i,
    );
    expect(Object.isFrozen(sink.snapshot())).toBe(true);
  });

  it("rejects unbounded labels and never lets a metrics sink break a calculation", () => {
    const sink = new AggregateCalculationPerformanceSink();
    expect(() =>
      sink.record({
        version: CALCULATION_PERFORMANCE_VERSION,
        flow: "public-daily",
        outcome: "owner=private" as never,
        durationMilliseconds: 1,
      }),
    ).toThrow("observation is invalid");
    const broken = { record: vi.fn(() => void 0) };
    broken.record.mockImplementation(() => {
      throw new Error("metrics unavailable");
    });
    expect(() =>
      recordCalculationPerformance(broken, {
        flow: "public-daily",
        outcome: "hit",
        durationMilliseconds: 1,
      }),
    ).not.toThrow();
  });
});
