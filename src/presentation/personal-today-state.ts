import type { DashboardReadModel } from "./dashboard-read-model";
import type { PrivateProfileView } from "./private-profile-state";

export interface PersonalTodayProfileOption {
  readonly profileId: string;
  readonly birthProfileId: string;
  readonly revision: number;
  readonly displayName: string;
  readonly birthNameReady: boolean;
}

export function toPersonalTodayProfileOption(
  profile: PrivateProfileView,
): PersonalTodayProfileOption {
  return Object.freeze({
    profileId: profile.profileId,
    birthProfileId: profile.birthProfileId,
    revision: profile.revision,
    displayName: profile.displayName,
    birthNameReady: profile.birthName !== null,
  });
}

export type PersonalTodayActionState =
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
  | Readonly<{ status: "ready"; model: DashboardReadModel }>;

export const INITIAL_PERSONAL_TODAY_STATE: PersonalTodayActionState =
  Object.freeze({ status: "idle" });
