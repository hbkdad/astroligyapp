export type AccountDeletionState = Readonly<{
  status:
    "idle" | "deleted" | "authenticate" | "authorize" | "retry" | "reconcile";
}>;

export const INITIAL_ACCOUNT_DELETION_STATE: AccountDeletionState =
  Object.freeze({ status: "idle" });
