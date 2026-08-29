import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import type { TimelineFacts } from "@/application/compose-timeline-facts";
import { TimelineView } from "@/components/timeline-view";
import {
  getDemoTimeline,
  getDemoTimelineFacts,
} from "@/presentation/timeline-demo";
import {
  TIMELINE_READ_MODEL_VERSION,
  toTimelineReadModel,
  type TimelineReadModel,
} from "@/presentation/timeline-read-model";

let facts: TimelineFacts;
let model: TimelineReadModel;

beforeAll(async () => {
  [facts, model] = await Promise.all([
    getDemoTimelineFacts(),
    getDemoTimeline(),
  ]);
});

describe("timeline presentation boundary", () => {
  it("maps the Goal 23 aggregate into one frozen ordered read model", () => {
    expect(facts.metadata.composedAt).toBe("2000-04-01T00:00:00.000Z");
    for (const fact of facts.facts) {
      if (
        fact.type === "personal-transit" ||
        fact.type === "primary-phase" ||
        fact.type === "moon-sign-ingress" ||
        fact.type === "planetary-station"
      ) {
        expect(fact.source.metadata.calculatedAt).toBe(
          "2000-04-01T00:00:00.000Z",
        );
        expect(fact.source.metadata.provider.calculatedAt).toBe(
          "2000-04-01T00:00:00.000Z",
        );
        for (const evaluation of fact.source.metadata.evaluations)
          expect(evaluation.providerCalculatedAt).toBe(
            "2000-04-01T00:00:00.000Z",
          );
      }
    }
    expect(model).toMatchObject({
      version: TIMELINE_READ_MODEL_VERSION,
      sourceVersion: "1.0.0",
      intervalLabel: "December 15, 1999 to April 1, 2000 (end exclusive)",
    });
    expect(model.items).toHaveLength(6);
    expect(model.filters).toEqual([
      { key: "all", label: "All events", count: 6 },
      { key: "transits", label: "Transits", count: 1 },
      { key: "moon", label: "Moon", count: 1 },
      { key: "stations", label: "Stations", count: 1 },
      { key: "cycles", label: "Personal cycles", count: 3 },
    ]);
    expect(model.items.map((item) => item.id)).toEqual(
      facts.facts.map((fact) => fact.id),
    );
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.items)).toBe(true);
  });

  it("preserves window, instant, source ID, and version text equivalents", () => {
    expect(
      model.items.find((item) => item.filter === "transits"),
    ).toMatchObject({
      categoryLabel: "Personal transit",
      title: "Venus Conjunction natal Mars",
      occurrenceKind: "window",
      sourceVersion: "1.1.0",
    });
    expect(
      model.items.find((item) => item.filter === "transits")!.occurrenceLabel,
    ).toMatch(/^Starts .+; exact .+; ends .+ UTC$/);
    expect(model.items.find((item) => item.filter === "moon")).toMatchObject({
      categoryLabel: "Moon phase",
      title: "New Moon",
      dateTime: expect.stringMatching(/^2000-01-06T/),
    });
    expect(model.trace).toContainEqual({
      label: "Numerology strategy",
      value: "pythagorean 1.0.0",
    });
  });

  it("renders semantic timeline and complete filtered table equivalents", () => {
    const html = renderToStaticMarkup(
      <TimelineView state={{ status: "ready", model }} />,
    );
    expect(html).toContain('<main id="timeline-content"');
    expect(html).toContain('<nav aria-label="Timeline navigation"');
    expect(html).toContain('role="group" aria-label="Filter timeline events"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Filtered timeline event table"');
    expect(html).toContain("Complete text equivalent");
    expect(html).toContain("View source versions");
    expect(html).toContain(
      "performs no event search, astrology, or numerology calculation",
    );
  });

  it.each([
    { status: "loading" as const },
    { status: "locked" as const, message: "Sign in to continue." },
    { status: "error" as const, message: "Provider result unavailable." },
  ])("renders the $status state deliberately", (state) => {
    const html = renderToStaticMarkup(<TimelineView state={state} />);
    expect(html).toContain("<main");
    expect(html).toContain(state.status === "loading" ? "polite" : "assertive");
    expect(html).not.toContain("undefined");
  });

  it("renders a deliberate empty success state", () => {
    const empty = structuredClone(model);
    (empty as unknown as { items: unknown[] }).items = [];
    (empty as unknown as { filters: { count: number }[] }).filters.forEach(
      (filter) => (filter.count = 0),
    );
    const html = renderToStaticMarkup(
      <TimelineView state={{ status: "ready", model: empty }} />,
    );
    expect(html).toContain("No events match this filter");
    expect(html).toContain("The filtered event table is empty");
  });

  it("fails closed on version, ordering, range, and duplicate corruption", () => {
    const version = structuredClone(facts);
    (version as unknown as { version: string }).version = "0.9.0";
    expect(() => toTimelineReadModel(version)).toThrow("Unsupported timeline");

    const ordering = structuredClone(facts);
    (ordering.facts as unknown as unknown[]).reverse();
    expect(() => toTimelineReadModel(ordering)).toThrow(
      "deterministic ordering",
    );

    const outside = structuredClone(facts);
    const first = outside.facts[0]!;
    if (first.occurrence.kind !== "window")
      throw new Error("Expected transit window");
    (first.occurrence as { startInstant: string }).startInstant =
      outside.interval.endInstant;
    expect(() => toTimelineReadModel(outside)).toThrow(
      "outside the display interval",
    );

    const duplicate = structuredClone(facts);
    (duplicate.facts as unknown as unknown[]).push(duplicate.facts[0]!);
    expect(() => toTimelineReadModel(duplicate)).toThrow("must be unique");
  });
});
