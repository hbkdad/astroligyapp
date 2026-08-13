import { describe, expect, it } from "vitest";

import {
  PERSONAL_TODAY_CONTRACT_VERSION,
  validatePersonalTodayCommand,
} from "@/server/personal-today-contracts";

const command = {
  version: PERSONAL_TODAY_CONTRACT_VERSION,
  profileId: "10000000-0000-4000-8000-000000000001",
  birthProfileId: "20000000-0000-4000-8000-000000000001",
  revision: 1,
};

describe("personal Today selection contract", () => {
  it("accepts only an exact opaque saved-profile reference", () => {
    expect(validatePersonalTodayCommand(command)).toEqual(command);
    expect(Object.isFrozen(validatePersonalTodayCommand(command))).toBe(true);
  });

  it.each([
    { ...command, ownerId: command.profileId },
    { ...command, birthName: "browser supplied" },
    { ...command, revision: 0 },
    { ...command, profileId: "attacker" },
    { ...command, version: "2.0.0" },
  ])("rejects malformed or over-posted input %#", (value) => {
    expect(validatePersonalTodayCommand(value)).toBeNull();
  });
});
