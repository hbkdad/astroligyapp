import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PersonalTimelineSelector } from "@/components/personal-timeline-selector";

describe("PersonalTimelineSelector", () => {
  it("renders a protected POST selector without private identifiers in links", () => {
    const html = renderToStaticMarkup(
      <PersonalTimelineSelector
        profiles={[
          {
            profileId: "11111111-1111-4111-8111-111111111111",
            birthProfileId: "22222222-2222-4222-8222-222222222222",
            revision: 2,
            displayName: "Private profile",
          },
        ]}
        initialStatus="ready"
        action={vi.fn()}
      />,
    );
    expect(html).toContain("Your personal timeline");
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
    expect(html).not.toMatch(/href="[^"]*11111111/);
    expect(html).not.toContain("startInstant");
    expect(html).toContain("never enter the URL");
  });
});
