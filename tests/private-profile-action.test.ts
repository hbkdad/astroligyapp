import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadPrivateProfilesFromHeaders,
  mutatePrivateProfileFromForm,
  type PrivateProfileService,
} from "@/server/private-profile-action";
import type { PrivateProfileCommand } from "@/server/private-profile-contracts";
import type {
  PrivateProfileMutationResult,
  PrivateProfileReadResult,
} from "@/server/authenticated-private-profiles";

const ORIGIN = "https://app.example.test";

function createForm() {
  const data = new FormData();
  const entries: Array<[string, string]> = [
    ["version", "1.1.0"],
    ["operation", "create"],
    ["displayName", "Mira"],
    ["birthName", "Mira Sol Chen"],
    ["currentTimezone", "America/Toronto"],
    ["birthDate", "1990-01-01"],
    ["birthTimePrecision", "exact"],
    ["birthTimeLocal", "13:45"],
    ["birthTimezone", "America/Toronto"],
    ["latitude", "48.475800"],
    ["longitude", "-81.330500"],
  ];
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

function fixture() {
  const loadPrivateProfiles = vi.fn<
    (request: Request) => Promise<PrivateProfileReadResult>
  >(async () => ({
    version: "1.1.0",
    disposition: "ready",
    profiles: [],
    multipleProfilesAllowed: false,
  }));
  const mutatePrivateProfile = vi.fn<
    (
      request: Request,
      command: PrivateProfileCommand,
    ) => Promise<PrivateProfileMutationResult>
  >(async () => ({ version: "1.1.0", disposition: "saved" }));
  const service: PrivateProfileService = {
    canonicalOrigin: ORIGIN,
    loadPrivateProfiles,
    mutatePrivateProfile,
  };
  return {
    service,
    loadPrivateProfiles,
    mutatePrivateProfile,
    getService: vi.fn(() => service),
  };
}

describe("private profile Server Action adapter", () => {
  it("forwards only a bounded cookie for private reads", async () => {
    const value = fixture();
    const headers = new Headers({
      cookie: "cosmic-auth.session_token=opaque",
      authorization: "Bearer attacker",
      "x-owner-id": "attacker",
    });
    await expect(
      loadPrivateProfilesFromHeaders(headers, value.getService),
    ).resolves.toEqual({
      status: "ready",
      profiles: [],
      multipleProfilesAllowed: false,
    });
    const request = value.loadPrivateProfiles.mock.calls[0]![0];
    expect(request.url).toBe(`${ORIGIN}/internal/private-profiles`);
    expect([...request.headers.entries()]).toEqual([
      ["cookie", "cosmic-auth.session_token=opaque"],
    ]);
  });

  it("constructs an exact typed create command without browser ownership", async () => {
    const value = fixture();
    await expect(
      mutatePrivateProfileFromForm(
        new Headers({ cookie: "session=opaque" }),
        createForm(),
        value.getService,
      ),
    ).resolves.toEqual({ status: "saved" });
    const [request, command] = value.mutatePrivateProfile.mock.calls[0]!;
    expect([...request.headers.entries()]).toEqual([
      ["cookie", "session=opaque"],
    ]);
    expect(command).toEqual({
      version: "1.1.0",
      operation: "create",
      value: {
        displayName: "Mira",
        birthName: "Mira Sol Chen",
        currentTimezone: "America/Toronto",
        birthDate: "1990-01-01",
        birthTimePrecision: "exact",
        birthTimeLocal: "13:45",
        birthTimezone: "America/Toronto",
        latitude: 48.4758,
        longitude: -81.3305,
      },
    });
    expect(JSON.stringify(command)).not.toMatch(/owner|subject|entitlement/i);
  });

  it("accepts exact update and explicit delete forms", async () => {
    const orderedUpdate = new FormData();
    const updateEntries: Array<[string, string]> = [
      ["version", "1.1.0"],
      ["operation", "update"],
      ["profileId", "11111111-1111-4111-8111-111111111111"],
      ["birthProfileId", "22222222-2222-4222-8222-222222222222"],
      ["revision", "2"],
      ["displayName", "Mira"],
      ["birthName", ""],
      ["currentTimezone", "America/Toronto"],
      ["birthDate", "1990-01-01"],
      ["birthTimePrecision", "date-only"],
      ["birthTimeLocal", ""],
      ["birthTimezone", "America/Toronto"],
      ["latitude", ""],
      ["longitude", ""],
    ];
    for (const [key, value] of updateEntries) orderedUpdate.append(key, value);
    const value = fixture();
    await expect(
      mutatePrivateProfileFromForm(
        new Headers(),
        orderedUpdate,
        value.getService,
      ),
    ).resolves.toEqual({ status: "saved" });
    expect(value.mutatePrivateProfile.mock.calls[0]![1]).toMatchObject({
      operation: "update",
      revision: 2,
      value: { birthTimeLocal: null, latitude: null, longitude: null },
    });

    const deletion = new FormData();
    const deleteEntries: Array<[string, string]> = [
      ["version", "1.1.0"],
      ["operation", "delete"],
      ["profileId", "11111111-1111-4111-8111-111111111111"],
      ["birthProfileId", "22222222-2222-4222-8222-222222222222"],
      ["revision", "2"],
      ["confirmation", "DELETE PROFILE"],
    ];
    for (const [key, entry] of deleteEntries) deletion.append(key, entry);
    await expect(
      mutatePrivateProfileFromForm(new Headers(), deletion, value.getService),
    ).resolves.toEqual({ status: "saved" });
    expect(value.mutatePrivateProfile.mock.calls[1]![1]).toMatchObject({
      operation: "delete",
      revision: 2,
    });
  });

  it.each([
    ["extra owner", (data: FormData) => data.append("ownerId", "attacker")],
    [
      "reordered",
      (data: FormData) => {
        const name = data.get("displayName")!;
        data.delete("displayName");
        data.append("displayName", name);
      },
    ],
    ["duplicate", (data: FormData) => data.append("birthDate", "1991-01-01")],
    [
      "file",
      (data: FormData) =>
        data.set("displayName", new Blob(["Mira"]), "name.txt"),
    ],
  ])("rejects %s before service construction", async (_label, mutate) => {
    const data = createForm();
    mutate(data);
    const value = fixture();
    await expect(
      mutatePrivateProfileFromForm(new Headers(), data, value.getService),
    ).resolves.toEqual({ status: "authorize" });
    expect(value.getService).not.toHaveBeenCalled();
  });

  it("collapses malformed results, unsafe origin, and dependency failure", async () => {
    const malformed = fixture();
    malformed.mutatePrivateProfile.mockResolvedValueOnce({
      version: "1.1.0",
      disposition: "saved",
      ownerId: "private",
    } as never);
    await expect(
      mutatePrivateProfileFromForm(
        new Headers(),
        createForm(),
        malformed.getService,
      ),
    ).resolves.toEqual({ status: "retry" });

    const unsafe = fixture();
    const unsafeService = {
      ...unsafe.service,
      canonicalOrigin: "https://app.example.test/path",
    };
    await expect(
      loadPrivateProfilesFromHeaders(new Headers(), () => unsafeService),
    ).resolves.toEqual({ status: "retry" });

    const failed = fixture();
    failed.loadPrivateProfiles.mockRejectedValueOnce(
      new Error("private database"),
    );
    await expect(
      loadPrivateProfilesFromHeaders(new Headers(), failed.getService),
    ).resolves.toEqual({ status: "retry" });
  });
});
