import type { PrivateProfileView } from "./private-profile-state";
import type { TimelineReadModel } from "./timeline-read-model";

export interface PersonalTimelineProfileOption {
  readonly profileId: string;
  readonly birthProfileId: string;
  readonly revision: number;
  readonly displayName: string;
}

export function toPersonalTimelineProfileOption(
  profile: PrivateProfileView,
): PersonalTimelineProfileOption {
  return Object.freeze({
    profileId: profile.profileId,
    birthProfileId: profile.birthProfileId,
    revision: profile.revision,
    displayName: profile.displayName,
  });
}

export type PersonalTimelineActionState =
  | Readonly<{ status: "idle" | "loading" }>
  | Readonly<{
      status:
        | "authenticate"
        | "authorize"
        | "locked"
        | "conflict"
        | "incomplete"
        | "stale"
        | "unavailable"
        | "retry";
      message: string;
    }>
  | Readonly<{
      status: "ready";
      model: TimelineReadModel;
      scope: "forecast" | "full-transit-calendar";
      truncated: boolean;
    }>;

export const INITIAL_PERSONAL_TIMELINE_STATE: PersonalTimelineActionState =
  Object.freeze({ status: "idle" });
