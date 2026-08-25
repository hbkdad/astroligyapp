// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NotificationPreferenceSelector,
  type NotificationPreferenceAction,
} from "@/components/notification-preference-selector";

afterEach(cleanup);

describe("notification preference interface", () => {
  it("loads by opaque POST, labels unavailable delivery, and exposes natal-local controls", async () => {
    const load = vi.fn<NotificationPreferenceAction>(async () => ({
      status: "ready",
      view: view(),
      materialization: null,
    }));
    const user = userEvent.setup();
    const { container } = render(
      <NotificationPreferenceSelector
        profiles={[
          {
            profileId: "11111111-1111-4111-8111-111111111111",
            birthProfileId: "22222222-2222-4222-8222-222222222222",
            profileRevision: 1,
            displayName: "Mira",
          },
        ]}
        initialStatus="ready"
        loadAction={load}
        replaceAction={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Manage alerts for Mira" }),
    );
    expect(
      await screen.findByRole(
        "heading",
        {
          name: "Email delivery is unavailable",
        },
        { timeout: 10_000 },
      ),
    ).toBeVisible();
    expect(screen.getByText(/No email is sent/i)).toBeVisible();
    expect(
      screen.getByRole("group", { name: /Quiet hours in America/ }),
    ).toBeVisible();
    expect(container.innerHTML).not.toContain("private@example.test");
    const [, data] = load.mock.calls[0]!;
    expect([...data.keys()]).toEqual([
      "version",
      "profileId",
      "birthProfileId",
      "profileRevision",
    ]);
  });

  it("withdraws consent without submitting contact, plan, timezone, or facts", async () => {
    const replace = vi.fn<NotificationPreferenceAction>(async () => ({
      status: "ready",
      view: view({
        preferenceRevision: 2,
        consent: false,
        eventTypes: [],
        quietHours: null,
      }),
      materialization: {
        status: "prepared",
        inserted: 0,
        existing: 0,
        invalidated: 1,
        skippedPast: 0,
        deliveryProvider: "unavailable",
      },
    }));
    const user = userEvent.setup();
    render(
      <NotificationPreferenceSelector
        profiles={[]}
        initialStatus="ready"
        loadAction={vi.fn()}
        replaceAction={replace}
      />,
    );
    // Load the ready settings through the same public component boundary.
    cleanup();
    const load = vi.fn<NotificationPreferenceAction>(async () => ({
      status: "ready",
      view: view(),
      materialization: null,
    }));
    render(
      <NotificationPreferenceSelector
        profiles={[
          {
            profileId: "11111111-1111-4111-8111-111111111111",
            birthProfileId: "22222222-2222-4222-8222-222222222222",
            profileRevision: 1,
            displayName: "Mira",
          },
        ]}
        initialStatus="ready"
        loadAction={load}
        replaceAction={replace}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Manage alerts for Mira" }),
    );
    const consent = await screen.findByRole("checkbox", {
      name: /Prepare email alert candidates/i,
    });
    await user.click(consent);
    await user.click(
      screen.getByRole("button", { name: "Withdraw alert consent" }),
    );
    expect(await screen.findByText("Preferences saved")).toBeVisible();
    const [, data] = replace.mock.calls[0]!;
    expect(data.get("consent")).toBe("false");
    expect(data.get("eventTypes")).toBe("[]");
    expect([...data.keys()]).not.toEqual(
      expect.arrayContaining(["email", "plan", "timezone", "timeline"]),
    );
  });
});

function view(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0.0",
    profileId: "11111111-1111-4111-8111-111111111111",
    birthProfileId: "22222222-2222-4222-8222-222222222222",
    profileRevision: 1,
    preferenceRevision: 1,
    displayName: "Mira",
    channel: "email",
    channelAvailability: "provider-unavailable",
    consent: true,
    eventTypes: ["primary-phase"],
    leadMinutes: 60,
    quietHours: { start: "22:00", end: "07:00" },
    timezone: "America/Toronto",
    deliveries: [],
    ...overrides,
  } as never;
}
