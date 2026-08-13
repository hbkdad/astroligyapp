export const CALCULATION_PERFORMANCE_VERSION = "1.0.0";

export type CalculationPerformanceFlow = "public-daily" | "public-lunar";
export type CalculationPerformanceOutcome =
  | "hit"
  | "miss"
  | "coalesced"
  | "expired-regenerated"
  | "invalid-regenerated"
  | "write-skipped"
  | "source-unavailable"
  | "cache-unavailable"
  | "invalid-clock"
  | "invalid-date";

export interface CalculationPerformanceObservation {
  readonly version: typeof CALCULATION_PERFORMANCE_VERSION;
  readonly flow: CalculationPerformanceFlow;
  readonly outcome: CalculationPerformanceOutcome;
  readonly durationMilliseconds: number;
  readonly providerPositionCallCount?: number;
}

export interface CalculationPerformanceSink {
  record(observation: CalculationPerformanceObservation): void;
}

export interface CalculationPerformanceAggregate {
  readonly flow: CalculationPerformanceFlow;
  readonly outcome: CalculationPerformanceOutcome;
  readonly count: number;
  readonly totalDurationMilliseconds: number;
  readonly maximumDurationMilliseconds: number;
  readonly providerPositionCallCount: number;
}

export class AggregateCalculationPerformanceSink implements CalculationPerformanceSink {
  private readonly values = new Map<
    string,
    Omit<CalculationPerformanceAggregate, "flow" | "outcome">
  >();

  record(observation: CalculationPerformanceObservation): void {
    validateObservation(observation);
    const key = `${observation.flow}|${observation.outcome}`;
    const current = this.values.get(key) ?? {
      count: 0,
      totalDurationMilliseconds: 0,
      maximumDurationMilliseconds: 0,
      providerPositionCallCount: 0,
    };
    this.values.set(key, {
      count: current.count + 1,
      totalDurationMilliseconds:
        current.totalDurationMilliseconds + observation.durationMilliseconds,
      maximumDurationMilliseconds: Math.max(
        current.maximumDurationMilliseconds,
        observation.durationMilliseconds,
      ),
      providerPositionCallCount:
        current.providerPositionCallCount +
        (observation.providerPositionCallCount ?? 0),
    });
  }

  snapshot(): readonly CalculationPerformanceAggregate[] {
    return deepFreeze(
      [...this.values.entries()]
        .map(([key, value]) => {
          const [flow, outcome] = key.split("|") as [
            CalculationPerformanceFlow,
            CalculationPerformanceOutcome,
          ];
          return { flow, outcome, ...value };
        })
        .sort(
          (left, right) =>
            left.flow.localeCompare(right.flow) ||
            left.outcome.localeCompare(right.outcome),
        ),
    );
  }
}

export function recordCalculationPerformance(
  sink: CalculationPerformanceSink | undefined,
  observation: Omit<CalculationPerformanceObservation, "version">,
): void {
  if (!sink) return;
  try {
    sink.record({ version: CALCULATION_PERFORMANCE_VERSION, ...observation });
  } catch {
    // Metrics must never change calculation availability or expose sink errors.
  }
}

function validateObservation(value: CalculationPerformanceObservation): void {
  if (
    value.version !== CALCULATION_PERFORMANCE_VERSION ||
    !["public-daily", "public-lunar"].includes(value.flow) ||
    ![
      "hit",
      "miss",
      "coalesced",
      "expired-regenerated",
      "invalid-regenerated",
      "write-skipped",
      "source-unavailable",
      "cache-unavailable",
      "invalid-clock",
      "invalid-date",
    ].includes(value.outcome) ||
    !Number.isFinite(value.durationMilliseconds) ||
    value.durationMilliseconds < 0 ||
    (value.providerPositionCallCount !== undefined &&
      (!Number.isInteger(value.providerPositionCallCount) ||
        value.providerPositionCallCount < 0))
  )
    throw new RangeError("Calculation performance observation is invalid");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
