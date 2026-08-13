export type PrivateProfilePrecision = "date-only" | "approximate" | "exact";

export type PrivateProfileView = Readonly<{
  profileId: string;
  birthProfileId: string;
  revision: number;
  displayName: string;
  currentTimezone: string;
  birthDate: string;
  birthTimePrecision: PrivateProfilePrecision;
  birthTimeLocal: string | null;
  birthTimezone: string;
  latitude: number | null;
  longitude: number | null;
}>;

export type PrivateProfileActionState = Readonly<{
  status:
    | "idle"
    | "saved"
    | "deleted"
    | "authenticate"
    | "authorize"
    | "limit"
    | "conflict"
    | "retry";
}>;

export const INITIAL_PRIVATE_PROFILE_ACTION_STATE: PrivateProfileActionState =
  Object.freeze({ status: "idle" });
