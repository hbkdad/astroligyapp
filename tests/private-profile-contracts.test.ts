import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  validatePrivateProfileCommand,
  validatePrivateProfileView,
  validatePrivateProfileWrite,
} from "@/server/private-profile-contracts";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const PROFILE = "11111111-1111-4111-8111-111111111111";
const BIRTH = "22222222-2222-4222-8222-222222222222";

function write(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "  José   Chen  ",
    birthName: "  José   Antonio   Chen  ",
    currentTimezone: "America/Toronto",
    birthDate: "1990-02-28",
    birthTimePrecision: "exact",
    birthTimeLocal: "13:45",
    birthTimezone: "America/Toronto",
    latitude: 48.4758,
    longitude: -81.3305,
    ...overrides,
  };
}

describe("private profile contracts", () => {
  it("normalizes bounded Unicode names and preserves explicit precision/location", () => {
    const value = validatePrivateProfileWrite(write(), NOW);
    expect(value).toEqual({
      ...write(),
      displayName: "José Chen",
      birthName: "José Antonio Chen",
    });
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("accepts date-only input only without time and coordinates only as a pair", () => {
    expect(
      validatePrivateProfileWrite(
        write({
          birthTimePrecision: "date-only",
          birthTimeLocal: null,
          latitude: null,
          longitude: null,
        }),
        NOW,
      ),
    ).not.toBeNull();
    expect(
      validatePrivateProfileWrite(write({ latitude: null }), NOW),
    ).toBeNull();
  });

  it.each([
    { displayName: "\u0000hidden" },
    { displayName: "x".repeat(81) },
    { birthName: "x".repeat(161) },
    { birthName: "Mira\u0000 Chen" },
    { currentTimezone: "Mars/Olympus" },
    { birthTimezone: "America/Toronto\nleak" },
    { birthDate: "2026-02-30" },
    { birthDate: "2026-08-14" },
    { birthDate: "1799-12-31" },
    { birthTimePrecision: "exact", birthTimeLocal: "24:00" },
    { birthTimePrecision: "date-only", birthTimeLocal: "12:00" },
    { birthTimePrecision: "unknown" },
    { latitude: 90.000001 },
    { longitude: -180.000001 },
    { latitude: 48.1234567 },
    { longitude: Number.NaN },
  ])("rejects invalid boundary input %#", (overrides) => {
    expect(validatePrivateProfileWrite(write(overrides), NOW)).toBeNull();
  });

  it("validates exact create, update, and delete commands", () => {
    expect(
      validatePrivateProfileCommand(
        { version: "1.1.0", operation: "create", value: write() },
        NOW,
      ),
    ).toMatchObject({ operation: "create" });
    expect(
      validatePrivateProfileCommand(
        {
          version: "1.1.0",
          operation: "update",
          profileId: PROFILE,
          birthProfileId: BIRTH,
          revision: 1,
          value: write(),
        },
        NOW,
      ),
    ).toMatchObject({ operation: "update", revision: 1 });
    expect(
      validatePrivateProfileCommand(
        {
          version: "1.1.0",
          operation: "delete",
          profileId: PROFILE,
          birthProfileId: BIRTH,
          revision: 1,
        },
        NOW,
      ),
    ).toMatchObject({ operation: "delete" });
  });

  it.each([
    { version: "2.0.0", operation: "create", value: write() },
    {
      version: "1.1.0",
      operation: "delete",
      profileId: PROFILE,
      birthProfileId: BIRTH,
      revision: 0,
    },
    {
      version: "1.1.0",
      operation: "delete",
      profileId: "attacker",
      birthProfileId: BIRTH,
      revision: 1,
    },
    { version: "1.1.0", operation: "create", value: write(), ownerId: PROFILE },
  ])("rejects malformed or hostile command %#", (command) => {
    expect(validatePrivateProfileCommand(command, NOW)).toBeNull();
  });

  it("accepts only exact private view projections", () => {
    const view = {
      profileId: PROFILE,
      birthProfileId: BIRTH,
      revision: 1,
      ...write({ displayName: "Mira" }),
    };
    expect(validatePrivateProfileView(view)).toEqual({
      ...view,
      birthName: "José Antonio Chen",
    });
    expect(
      validatePrivateProfileView({ ...view, subject: "private" }),
    ).toBeNull();
  });
});
