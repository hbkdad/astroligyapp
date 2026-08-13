// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ProtectedNatalCharts } from "@/components/protected-natal-charts";

const action = vi.fn(async () => ({ disposition: "generated" as const }));
const base = {
  profileId: "10000000-0000-4000-8000-000000000001",
  birthProfileId: "20000000-0000-4000-8000-000000000001",
  revision: 1,
  displayName: "Mira",
  timePrecision: "exact" as const,
  generationAllowed: true,
  chartStale: false,
  chart: null,
};

describe("protected natal chart interface", () => {
  it("shows explicit readiness failures without a generation control", () => {
    render(
      <ProtectedNatalCharts
        profiles={[{ ...base, readiness: "ambiguous-time" }]}
        action={action}
      />,
    );
    expect(screen.getByText(/occurs twice/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /generate/i }),
    ).not.toBeInTheDocument();
  });

  it("submits only hidden resource references for a ready profile", () => {
    const { container } = render(
      <ProtectedNatalCharts
        profiles={[{ ...base, readiness: "ready" }]}
        action={action}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Generate verified chart" }),
    ).toBeEnabled();
    const names = [...container.querySelectorAll("input")].map(
      (input) => input.name,
    );
    expect(names).toEqual([
      "version",
      "profileId",
      "birthProfileId",
      "revision",
    ]);
    expect(container.textContent).not.toContain("10000000-0000");
  });
});
