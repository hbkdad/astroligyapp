import { describe, expect, it } from "vitest";

import { validateNotificationPreferenceCommand } from "@/server/notification-preference-contracts";

const command = {
  version: "1.0.0",
  operation: "replace",
  profileId: "11111111-1111-4111-8111-111111111111",
  birthProfileId: "22222222-2222-4222-8222-222222222222",
  profileRevision: 3,
  preferenceRevision: 0,
  channel: "email",
  consent: true,
  eventTypes: ["personal-transit", "primary-phase"],
  leadMinutes: 60,
  quietHours: { start: "22:00", end: "07:00" },
};

describe("notification preference contract", () => {
  it("accepts one exact ordered consented preference aggregate", () => {
    const result = validateNotificationPreferenceCommand(command);
    expect(result).toEqual(command);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    { ...command, ownerId: "33333333-3333-4333-8333-333333333333" },
    { ...command, channel: "push" },
    { ...command, eventTypes: ["primary-phase", "personal-transit"] },
    { ...command, eventTypes: ["primary-phase", "primary-phase"] },
    { ...command, consent: false },
    { ...command, leadMinutes: 30 },
    { ...command, quietHours: { start: "22:00", end: "22:00" } },
  ])("rejects malformed, over-posted, or inconsistent input", (value) => {
    expect(validateNotificationPreferenceCommand(value)).toBeNull();
  });

  it("accepts explicit withdrawal only with no enabled event families", () => {
    expect(
      validateNotificationPreferenceCommand({
        ...command,
        consent: false,
        eventTypes: [],
        quietHours: null,
      }),
    ).not.toBeNull();
  });
});
