import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  generateProtectedNatalChartFromForm,
  loadProtectedNatalChartsFromHeaders,
} from "@/server/protected-natal-chart-action";

const headers = new Headers({ cookie: "session=private" });
const command = [
  ["version", "1.0.0"],
  ["profileId", "10000000-0000-4000-8000-000000000001"],
  ["birthProfileId", "20000000-0000-4000-8000-000000000001"],
  ["revision", "1"],
] as const;

function service() {
  return {
    canonicalOrigin: "https://app.example.test",
    generateProtectedNatalChart: vi
      .fn()
      .mockResolvedValue({ version: "1.0.0", disposition: "generated" }),
    loadProtectedNatalCharts: vi.fn().mockResolvedValue({
      version: "1.0.0",
      disposition: "ready",
      profiles: [],
    }),
  };
}

describe("protected natal chart action adapter", () => {
  it("forwards only an exact ordered opaque-resource command and bounded cookie", async () => {
    const target = service();
    const form = new FormData();
    for (const [key, value] of command) form.append(key, value);
    await expect(
      generateProtectedNatalChartFromForm(headers, form, () => target),
    ).resolves.toEqual({ disposition: "generated" });
    const [request, value] = target.generateProtectedNatalChart.mock.calls[0]!;
    expect(value).toEqual({
      version: "1.0.0",
      profileId: command[1][1],
      birthProfileId: command[2][1],
      revision: 1,
    });
    expect(request.headers.get("cookie")).toBe("session=private");
    expect(request.url).toBe(
      "https://app.example.test/internal/protected-natal-chart",
    );
  });

  it.each(["ownerId", "birthDate", "timezone", "entitlement"])(
    "rejects %s before service construction",
    async (field) => {
      const form = new FormData();
      for (const [key, value] of command) form.append(key, value);
      form.append(field, "browser-value");
      const factory = vi.fn(service);
      await expect(
        generateProtectedNatalChartFromForm(headers, form, factory),
      ).resolves.toEqual({ disposition: "authorize" });
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it("fails closed on malformed read projections", async () => {
    const target = service();
    target.loadProtectedNatalCharts.mockResolvedValue({
      version: "1.0.0",
      disposition: "ready",
      profiles: [],
      ownerId: "leak",
    });
    await expect(
      loadProtectedNatalChartsFromHeaders(headers, () => target),
    ).resolves.toEqual({ status: "retry" });
  });
});
