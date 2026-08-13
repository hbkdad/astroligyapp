// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  PrivateProfiles,
  type PrivateProfileAction,
} from "@/components/private-profiles";
import type { PrivateProfileView } from "@/presentation/private-profile-state";

const PROFILE: PrivateProfileView = {
  profileId: "11111111-1111-4111-8111-111111111111",
  birthProfileId: "22222222-2222-4222-8222-222222222222",
  revision: 2,
  displayName: "Mira Chen",
  birthName: "Mira Sol Chen",
  currentTimezone: "America/Toronto",
  birthDate: "1990-01-01",
  birthTimePrecision: "exact",
  birthTimeLocal: "13:45",
  birthTimezone: "America/Toronto",
  latitude: 48.4758,
  longitude: -81.3305,
};

afterEach(cleanup);

describe("private profile interface", () => {
  it("renders a privacy-safe empty state and exact create form", async () => {
    const action = vi.fn<PrivateProfileAction>(async () => ({
      status: "saved",
    }));
    const user = userEvent.setup();
    render(
      <PrivateProfiles
        profiles={[]}
        multipleProfilesAllowed={false}
        action={action}
      />,
    );
    expect(
      screen.getByText("No private profiles are saved yet."),
    ).toBeVisible();
    expect(screen.getByText(/never placed in public links/i)).toBeVisible();
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Mira");
    await user.type(screen.getByLabelText("Birth date"), "1990-01-01");
    await user.click(
      screen.getByRole("button", { name: "Save private profile" }),
    );

    expect(action).toHaveBeenCalledOnce();
    const [, data] = action.mock.calls[0]!;
    expect([...data.keys()]).toEqual([
      "version",
      "operation",
      "displayName",
      "birthName",
      "currentTimezone",
      "birthDate",
      "birthTimePrecision",
      "birthTimeLocal",
      "birthTimezone",
      "latitude",
      "longitude",
    ]);
    expect([...data.keys()]).not.toContain("ownerId");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Private profile saved",
    );
  });

  it("requires time only when approximate or exact precision is selected", async () => {
    const user = userEvent.setup();
    render(
      <PrivateProfiles
        profiles={[]}
        multipleProfilesAllowed={false}
        action={vi.fn()}
      />,
    );
    const time = screen.getByLabelText("Local birth time");
    expect(time).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("Birth-time precision"),
      "approximate",
    );
    expect(time).toBeEnabled();
    expect(time).toBeRequired();
  });

  it("shows the server-owned one-profile entitlement state", () => {
    render(
      <PrivateProfiles
        profiles={[PROFILE]}
        multipleProfilesAllowed={false}
        action={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "One-profile limit reached",
    );
    expect(
      screen.queryByRole("button", { name: "Save private profile" }),
    ).not.toBeInTheDocument();
  });

  it("renders text equivalents and focuses update failures", async () => {
    const action = vi.fn<PrivateProfileAction>(async () => ({
      status: "conflict",
    }));
    const user = userEvent.setup();
    render(
      <PrivateProfiles
        profiles={[PROFILE]}
        multipleProfilesAllowed
        action={action}
      />,
    );
    expect(screen.getByText("48.475800, -81.330500")).toBeVisible();
    await user.click(screen.getByText("Edit private details"));
    await user.click(
      screen.getByRole("button", { name: "Save profile changes" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("changed in another session");
    expect(alert).toHaveFocus();
  });

  it("requires explicit profile deletion and disables a pending replay", async () => {
    let finish: ((state: { status: "deleted" }) => void) | undefined;
    const action = vi.fn<PrivateProfileAction>(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const user = userEvent.setup();
    render(
      <PrivateProfiles
        profiles={[PROFILE]}
        multipleProfilesAllowed
        action={action}
      />,
    );
    await user.click(screen.getByText("Delete this profile"));
    await user.type(
      screen.getByLabelText("Type DELETE PROFILE"),
      "DELETE PROFILE",
    );
    await user.click(
      screen.getByRole("button", { name: "Permanently delete profile" }),
    );
    expect(
      await screen.findByRole("button", { name: "Deleting profile…" }),
    ).toBeDisabled();
    expect(action).toHaveBeenCalledOnce();
    const [, data] = action.mock.calls[0]!;
    expect([...data.keys()]).toEqual([
      "version",
      "operation",
      "profileId",
      "birthProfileId",
      "revision",
      "confirmation",
    ]);
    finish?.({ status: "deleted" });
  });
});
