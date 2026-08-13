import type { NotificationPreferenceView } from "@/infrastructure/persistence/notification-preference-repository";
import type { PrivateProfileView } from "./private-profile-state";

export interface NotificationProfileOption {
  readonly profileId: string;
  readonly birthProfileId: string;
  readonly profileRevision: number;
  readonly displayName: string;
}

export function toNotificationProfileOption(
  profile: PrivateProfileView,
): NotificationProfileOption {
  return Object.freeze({
    profileId: profile.profileId,
    birthProfileId: profile.birthProfileId,
    profileRevision: profile.revision,
    displayName: profile.displayName,
  });
}

export type NotificationPreferenceActionState =
  | Readonly<{ status: "idle" | "loading" }>
  | Readonly<{
      status:
        | "authenticate"
        | "authorize"
        | "locked"
        | "conflict"
        | "unavailable"
        | "retry";
      message: string;
    }>
  | Readonly<{
      status: "ready";
      view: NotificationPreferenceView;
      materialization: null | Readonly<{
        status: "prepared" | "calculation-unavailable";
        inserted: number;
        existing: number;
        invalidated: number;
        skippedPast: number;
        deliveryProvider: "unavailable";
      }>;
    }>;

export const INITIAL_NOTIFICATION_PREFERENCE_STATE: NotificationPreferenceActionState =
  Object.freeze({ status: "idle" });
