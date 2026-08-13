// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/account-shell", () => ({
  AccountShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/components/personal-dashboard", () => ({
  PersonalDashboard: ({ badge }: { badge?: string }) => <main>{badge}</main>,
}));

import { PersonalTodaySelector } from "@/components/personal-today-selector";
import { getDemoDashboard } from "@/presentation/dashboard-demo";
import {
  toPersonalTodayProfileOption,
  type PersonalTodayProfileOption,
} from "@/presentation/personal-today-state";

const profile: PersonalTodayProfileOption = {
  profileId: "10000000-0000-4000-8000-000000000001",
  birthProfileId: "20000000-0000-4000-8000-000000000001",
  revision: 1,
  displayName: "Mira",
  birthNameReady: true,
};

describe("private personal Today interface", () => {
  it("projects only the fields required to select a saved profile", () => {
    expect(
      toPersonalTodayProfileOption({
        ...profile,
        birthName: "Mira Sol Chen",
        currentTimezone: "America/Toronto",
        birthDate: "1990-01-01",
        birthTimePrecision: "exact",
        birthTimeLocal: "13:45",
        birthTimezone: "America/Toronto",
        latitude: 48.4758,
        longitude: -81.3305,
      }),
    ).toEqual(profile);
    expect(Object.keys(profile)).not.toContain("birthName");
  });

  it("renders explicit anonymous, unavailable, and empty states", () => {
    const action = vi.fn();
    const { rerender } = render(
      <PersonalTodaySelector
        profiles={[]}
        initialStatus="authenticate"
        action={action}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Sign in again" }),
    ).toBeVisible();
    rerender(
      <PersonalTodaySelector
        profiles={[]}
        initialStatus="retry"
        action={action}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Profiles are temporarily unavailable",
      }),
    ).toBeVisible();
    rerender(
      <PersonalTodaySelector
        profiles={[]}
        initialStatus="ready"
        action={action}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No saved profile yet" }),
    ).toBeVisible();
  });

  it("posts only the exact opaque selection and renders private-ready labeling", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      status: "ready",
      model: await getDemoDashboard(),
    });
    render(
      <PersonalTodaySelector
        profiles={[profile]}
        initialStatus="ready"
        action={action}
      />,
    );
    expect(screen.getByText(/never placed in a public URL/i)).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Load Today for Mira" }),
    );
    expect(action).toHaveBeenCalledOnce();
    const [, data] = action.mock.calls[0]!;
    expect([...data.entries()]).toEqual([
      ["version", "1.0.0"],
      ["profileId", profile.profileId],
      ["birthProfileId", profile.birthProfileId],
      ["revision", "1"],
    ]);
    expect(await screen.findByText("Private calculated data")).toBeVisible();
  });
});
