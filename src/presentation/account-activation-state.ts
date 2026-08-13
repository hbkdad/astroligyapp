export type AccountActivationState = Readonly<{
  status: "idle" | "ready" | "authenticate" | "retry" | "reconcile";
}>;

export const INITIAL_ACCOUNT_ACTIVATION_STATE: AccountActivationState =
  Object.freeze({ status: "idle" });
