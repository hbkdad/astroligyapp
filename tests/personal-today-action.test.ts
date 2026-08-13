import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDemoDashboard } from "@/presentation/dashboard-demo";
import { loadPersonalTodayFromForm } from "@/server/personal-today-action";

const entries = [
  ["version", "1.0.0"],
  ["profileId", "10000000-0000-4000-8000-000000000001"],
  ["birthProfileId", "20000000-0000-4000-8000-000000000001"],
  ["revision", "1"],
] as const;

function form() {
  const value = new FormData();
  for (const [key, item] of entries) value.append(key, item);
  return value;
}

describe("personal Today server-action adapter", () => {
  it("forwards only the ordered selection and bounded session cookie", async () => {
    const model = await getDemoDashboard();
    const service = {
      canonicalOrigin: "https://app.example.test",
      loadPersonalToday: vi.fn().mockResolvedValue({
        version: "1.0.0",
        disposition: "ready",
        model,
      }),
    };
    const result = await loadPersonalTodayFromForm(
      new Headers({ cookie: "session=private" }),
      form(),
      () => service,
    );
    expect(result).toEqual({ status: "ready", model });
    const [request, command] = service.loadPersonalToday.mock.calls[0]!;
    expect(command).toEqual({
      version: "1.0.0",
      profileId: entries[1][1],
      birthProfileId: entries[2][1],
      revision: 1,
    });
    expect(request.url).toBe(
      "https://app.example.test/internal/personal-today",
    );
    expect(request.headers.get("cookie")).toBe("session=private");
  });

  it.each(["ownerId", "birthName", "timezone", "entitlement"])(
    "rejects %s before constructing the service",
    async (field) => {
      const value = form();
      value.append(field, "browser-value");
      const factory = vi.fn();
      await expect(
        loadPersonalTodayFromForm(new Headers(), value, factory),
      ).resolves.toMatchObject({ status: "authorize" });
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it("fails closed on an unsupported response version", async () => {
    const model = await getDemoDashboard();
    await expect(
      loadPersonalTodayFromForm(new Headers(), form(), () => ({
        canonicalOrigin: "https://app.example.test",
        loadPersonalToday: vi.fn().mockResolvedValue({
          version: "2.0.0",
          disposition: "ready",
          model,
        }),
      })),
    ).resolves.toMatchObject({ status: "retry" });
  });

  it("fails closed on an over-projected service response", async () => {
    const model = await getDemoDashboard();
    await expect(
      loadPersonalTodayFromForm(new Headers(), form(), () => ({
        canonicalOrigin: "https://app.example.test",
        loadPersonalToday: vi.fn().mockResolvedValue({
          version: "1.0.0",
          disposition: "ready",
          model,
          ownerId: "private-leak",
        }),
      })),
    ).resolves.toMatchObject({ status: "retry" });
  });
});
