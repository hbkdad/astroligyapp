import { describe, expect, it } from "vitest";

import {
  PERSONAL_TIMELINE_CONTRACT_VERSION,
  validatePersonalTimelineCommand,
} from "@/server/personal-timeline-contracts";

const command = {
  version: PERSONAL_TIMELINE_CONTRACT_VERSION,
  profileId: "11111111-1111-4111-8111-111111111111",
  birthProfileId: "22222222-2222-4222-8222-222222222222",
  revision: 1,
};

describe("personal timeline contract", () => {
  it("accepts only the exact opaque selection", () => {
    expect(validatePersonalTimelineCommand(command)).toEqual(command);
    expect(
      validatePersonalTimelineCommand({
        ...command,
        startInstant: "2000-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      validatePersonalTimelineCommand({ ...command, revision: 0 }),
    ).toBeNull();
    expect(
      validatePersonalTimelineCommand({ ...command, profileId: "public-name" }),
    ).toBeNull();
  });
});
