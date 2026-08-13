import { describe, expect, it } from "vitest";

import {
  materializeNotificationCandidates,
  NOTIFICATION_MATERIALIZATION_VERSION,
} from "@/application/materialize-notification-candidates";
import type { PersonalTimelineAggregate } from "@/application/calculate-personal-timeline";

const preference = {
  preferenceId: "11111111-1111-4111-8111-111111111111",
  revision: 2,
  eventType: "primary-phase" as const,
  timezone: "America/Toronto",
  leadMinutes: 360 as const,
  quietHours: { start: "22:00", end: "07:00" },
};

describe("notification candidate materialization", () => {
  it("uses peak/instant facts, applies overnight quiet hours, and retains complete identity", () => {
    const result = materializeNotificationCandidates(
      timeline("2026-08-14T03:00:00.000Z", "2026-08-14T12:00:00.000Z"),
      [preference],
      identity(),
    );
    expect(result).toMatchObject({
      ok: true,
      skippedPast: 0,
      candidates: [
        {
          eventReference: "lunar:phase:full-moon:fixture",
          eventOccursAt: "2026-08-14T12:00:00.000Z",
          scheduledAt: "2026-08-14T11:00:00.000Z",
          materializationVersion: NOTIFICATION_MATERIALIZATION_VERSION,
          identity: {
            profileRevision: 4,
            preferenceRevision: 2,
            calculationRunId: "33333333-3333-4333-8333-333333333333",
            timeline: { providerVersion: "fixture-1.0.0" },
          },
        },
      ],
    });
    expect(result.ok && Object.isFrozen(result.candidates)).toBe(true);
  });

  it("fails explicitly when quiet-hour end is nonexistent at a DST gap", () => {
    const result = materializeNotificationCandidates(
      timeline("2026-03-08T04:00:00.000Z", "2026-03-08T12:00:00.000Z"),
      [
        {
          ...preference,
          leadMinutes: 360,
          quietHours: { start: "22:00", end: "02:30" },
        },
      ],
      identity(),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "civil-time-unavailable",
        message: "A quiet-hours boundary could not be resolved uniquely",
      },
    });
  });

  it("fails explicitly when quiet-hour end is ambiguous at a DST fold", () => {
    const result = materializeNotificationCandidates(
      timeline("2026-11-01T04:00:00.000Z", "2026-11-01T12:00:00.000Z"),
      [
        {
          ...preference,
          leadMinutes: 360,
          quietHours: { start: "22:00", end: "01:30" },
        },
      ],
      identity(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "civil-time-unavailable" },
    });
  });

  it("skips occurred or quiet-delayed-past events and rejects trace mismatches", () => {
    const past = materializeNotificationCandidates(
      timeline("2026-08-14T13:00:00.000Z", "2026-08-14T12:00:00.000Z"),
      [preference],
      identity(),
    );
    expect(past).toMatchObject({ ok: true, candidates: [], skippedPast: 1 });
    const mismatch = materializeNotificationCandidates(
      timeline("2026-08-14T03:00:00.000Z", "2026-08-14T12:00:00.000Z"),
      [preference],
      { ...identity(), engineVersion: "wrong" },
    );
    expect(mismatch).toMatchObject({
      ok: false,
      error: { code: "invalid-input" },
    });
  });

  it("allows a future event to be scheduled exactly at its occurrence", () => {
    const result = materializeNotificationCandidates(
      timeline("2026-08-14T03:00:00.000Z", "2026-08-14T12:00:00.000Z"),
      [{ ...preference, leadMinutes: 0, quietHours: null }],
      identity(),
    );
    expect(result).toMatchObject({
      ok: true,
      candidates: [
        {
          eventOccursAt: "2026-08-14T12:00:00.000Z",
          scheduledAt: "2026-08-14T12:00:00.000Z",
        },
      ],
    });
  });
});

function timeline(
  start: string,
  occurrence: string,
): PersonalTimelineAggregate {
  const end = new Date(Date.parse(occurrence) + 7 * 86_400_000).toISOString();
  return {
    input: {
      requestedStartInstant: start,
      requestedEndInstant: end,
      effectiveStartInstant: start,
      effectiveEndInstant: end,
      scope: "forecast",
    },
    timeline: {
      version: "1.0.0",
      interval: { startInstant: start, endInstant: end },
      facts: [
        {
          id: "lunar:phase:full-moon:fixture",
          type: "primary-phase",
          occurrence: { kind: "instant", instant: occurrence },
          sourceVersion: "1.0.0",
          source: {} as never,
        },
      ],
      metadata: {
        composedAt: start,
        sourceVersions: {
          transitEventSearch: "1.1.0",
          lunarEventSearch: "1.0.0",
          stationEventSearch: "1.0.0",
        },
      },
    },
    metadata: {
      engineVersion: "1.0.0",
      policyVersion: "1.0.0",
      calculatedAt: start,
      truncated: false,
      truncationReasons: [],
      coarseStepSeconds: 43_200,
      coarseObservationCount: 1,
      providerPositionCallCount: 1,
      refinedEventCount: 1,
      boundaryWindowOmissionCount: 0,
      provider: provider(),
    },
  };
}

function identity() {
  return {
    profileId: "22222222-2222-4222-8222-222222222222",
    profileRevision: 4,
    calculationRunId: "33333333-3333-4333-8333-333333333333",
    scope: "forecast" as const,
    engineVersion: "1.0.0",
    policyVersion: "1.0.0",
    provider: provider(),
  };
}

function provider() {
  return {
    providerId: "fixture",
    providerVersion: "fixture-1.0.0",
    dataVersion: "fixture-data",
    calculatedAt: "2026-08-14T03:00:00.000Z",
    timeScale: "utc" as const,
    referenceFrame: "ecliptic-of-date" as const,
    zodiacReference: "tropical" as const,
    coordinateOrigin: "topocentric" as const,
  };
}
