import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPersonalTimelineFromForm } from "@/server/personal-timeline-action";

describe("personal timeline action", () => {
  it("forwards only cookie authentication and a strict POST command", async () => {
    const loadPersonalTimeline = vi.fn().mockResolvedValue({
      version: "1.0.0",
      disposition: "ready",
      model: { version: "1.0.0" },
      scope: "forecast",
      truncated: false,
    });
    const form = new FormData();
    form.append("version", "1.0.0");
    form.append("profileId", "11111111-1111-4111-8111-111111111111");
    form.append("birthProfileId", "22222222-2222-4222-8222-222222222222");
    form.append("revision", "1");
    const result = await loadPersonalTimelineFromForm(
      new Headers({
        cookie: "session=opaque",
        authorization: "Bearer ignored",
      }),
      form,
      () => ({ canonicalOrigin: "https://example.test", loadPersonalTimeline }),
    );
    expect(result.status).toBe("ready");
    const [request, command] = loadPersonalTimeline.mock.calls[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://example.test/internal/personal-timeline");
    expect(request.headers.get("cookie")).toBe("session=opaque");
    expect(request.headers.get("authorization")).toBeNull();
    expect(command).not.toHaveProperty("startInstant");
  });

  it("rejects browser-controlled intervals and duplicate fields", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      version: "1.0.0",
      profileId: "11111111-1111-4111-8111-111111111111",
      birthProfileId: "22222222-2222-4222-8222-222222222222",
      revision: "1",
      endInstant: "2099-01-01T00:00:00.000Z",
    }))
      form.append(key, value);
    const service = vi.fn();
    expect(
      (await loadPersonalTimelineFromForm(new Headers(), form, service)).status,
    ).toBe("authorize");
    expect(service).not.toHaveBeenCalled();
  });

  it("fails closed on malformed or unavailable internal responses", async () => {
    const form = new FormData();
    form.append("version", "1.0.0");
    form.append("profileId", "11111111-1111-4111-8111-111111111111");
    form.append("birthProfileId", "22222222-2222-4222-8222-222222222222");
    form.append("revision", "1");
    const malformed = await loadPersonalTimelineFromForm(
      new Headers(),
      form,
      () => ({
        canonicalOrigin: "https://example.test",
        loadPersonalTimeline: vi.fn().mockResolvedValue({
          version: "1.0.0",
          disposition: "ready",
          model: {},
          scope: "advanced",
          truncated: false,
        }),
      }),
    );
    const unavailable = await loadPersonalTimelineFromForm(
      new Headers(),
      form,
      () => {
        throw new Error("service unavailable");
      },
    );
    expect(malformed.status).toBe("retry");
    expect(unavailable.status).toBe("retry");
  });
});
