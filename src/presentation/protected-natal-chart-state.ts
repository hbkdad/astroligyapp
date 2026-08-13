import type { NatalChartReadModel } from "@/presentation/natal-chart-read-model";

export type ProtectedNatalReadiness =
  | "ready"
  | "date-only"
  | "coordinates-missing"
  | "ambiguous-time"
  | "nonexistent-time";

export interface ProtectedNatalChartProfileView {
  readonly profileId: string;
  readonly birthProfileId: string;
  readonly revision: number;
  readonly displayName: string;
  readonly timePrecision: "date-only" | "approximate" | "exact";
  readonly readiness: ProtectedNatalReadiness;
  readonly generationAllowed: boolean;
  readonly chartStale: boolean;
  readonly chart: NatalChartReadModel | null;
}

export type ProtectedNatalChartActionState = Readonly<{
  disposition:
    | "idle"
    | "generated"
    | "cached"
    | "authenticate"
    | "authorize"
    | "locked"
    | "conflict"
    | "date-only"
    | "coordinates-missing"
    | "ambiguous-time"
    | "nonexistent-time"
    | "unavailable"
    | "retry";
}>;

export const INITIAL_PROTECTED_NATAL_CHART_ACTION_STATE: ProtectedNatalChartActionState =
  Object.freeze({ disposition: "idle" });
