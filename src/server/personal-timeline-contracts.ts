export const PERSONAL_TIMELINE_CONTRACT_VERSION = "1.0.0";

export interface PersonalTimelineCommand {
  readonly version: typeof PERSONAL_TIMELINE_CONTRACT_VERSION;
  readonly profileId: string;
  readonly birthProfileId: string;
  readonly revision: number;
}

export function validatePersonalTimelineCommand(
  value: unknown,
): PersonalTimelineCommand | null {
  if (
    !record(value) ||
    !exact(value, ["version", "profileId", "birthProfileId", "revision"]) ||
    value.version !== PERSONAL_TIMELINE_CONTRACT_VERSION ||
    !uuid(value.profileId) ||
    !uuid(value.birthProfileId) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    (value.revision as number) > 999_999_999
  )
    return null;
  return Object.freeze({
    version: PERSONAL_TIMELINE_CONTRACT_VERSION,
    profileId: value.profileId,
    birthProfileId: value.birthProfileId,
    revision: value.revision as number,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
