import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { PublicLunarCalendarEngine } from "@/application/calculate-public-lunar-calendar";
import { PublicLunarCalendarView } from "@/components/public-lunar-calendar-view";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { publicLunarDateWindow } from "@/presentation/public-lunar-date";
import { toPublicLunarCalendarReadModel } from "@/presentation/public-lunar-calendar-read-model";

let calendar: Awaited<ReturnType<PublicLunarCalendarEngine["calculate"]>>;

beforeAll(async () => {
  calendar = await new PublicLunarCalendarEngine(
    new AstronomyEngineProvider(),
    () => new Date("2026-08-13T15:00:00.000Z"),
  ).calculate("2026-08-13");
});

describe("public lunar calendar presentation", () => {
  it("renders useful server HTML, visible breadcrumbs, approximations, event times, and trace", () => {
    expect(calendar.ok).toBe(true);
    if (!calendar.ok) return;
    const window = publicLunarDateWindow(
      "2026-08-13",
      new Date("2026-08-13T15:00:00.000Z"),
    )!;
    const model = toPublicLunarCalendarReadModel(calendar.value, window);
    const html = renderToStaticMarkup(
      <PublicLunarCalendarView model={model} />,
    );
    expect(html).toContain("Moon phase for August 13, 2026");
    expect(html).toContain("approximate");
    expect(html).toContain("estimate");
    expect(html).toContain("Refined events in the next seven days");
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain("Provider");
    expect(html).not.toMatch(
      /birthProfileId|birthTime|latitude|longitude|ownerId|calculationRunId/,
    );
    expect(Object.isFrozen(model.events)).toBe(true);
  });

  it("fails closed when an event provider trace is corrupted", () => {
    expect(calendar.ok).toBe(true);
    if (!calendar.ok || calendar.value.events.length === 0) return;
    const corrupted = structuredClone(calendar.value);
    (
      corrupted.events[0]!.metadata.provider as { dataVersion: string }
    ).dataVersion = "wrong";
    expect(() =>
      toPublicLunarCalendarReadModel(
        corrupted,
        publicLunarDateWindow(
          "2026-08-13",
          new Date("2026-08-13T15:00:00.000Z"),
        )!,
      ),
    ).toThrow("Public lunar events are invalid");
  });
});
