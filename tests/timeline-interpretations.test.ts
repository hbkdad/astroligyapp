import { beforeAll, describe, expect, it } from "vitest";

import { interpretTimelineFacts } from "@/application/interpret-timeline-facts";
import { getDemoTimelineFacts } from "@/presentation/timeline-demo";

describe("timeline interpretation boundary", () => {
  let result: Awaited<ReturnType<typeof getDemoTimelineFacts>>;

  beforeAll(async () => {
    result = await getDemoTimelineFacts();
  });

  it("renders only supported versioned tradition templates", () => {
    const output = interpretTimelineFacts(result);
    expect(output.preparedAt).toBe(result.metadata.composedAt);
    expect(output.items.length).toBeGreaterThan(0);
    expect(output.items.every((item) => item.status === "rendered")).toBe(true);
    expect(
      output.items.find((item) => item.key.includes("transit")),
    ).toMatchObject({
      status: "rendered",
      tradition: "astrology",
    });
    expect(
      output.unsupportedFactIds.some((id) => id.startsWith("station:")),
    ).toBe(true);
    expect(Object.isFrozen(output)).toBe(true);
  });
});
