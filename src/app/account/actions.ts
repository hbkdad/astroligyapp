"use server";

import "server-only";

import { headers } from "next/headers";

import type { AccountDeletionState } from "@/presentation/account-deletion-state";
import type { AccountActivationState } from "@/presentation/account-activation-state";
import { deleteAccountFromForm } from "@/server/account-deletion-action";
import { activateAccountFromHeaders } from "@/server/account-activation-action";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";

export async function activateAccountAction(
  _previousState: AccountActivationState,
  formData: FormData,
): Promise<AccountActivationState> {
  const containsClientFields = [...formData.keys()].some(
    (key) => !key.startsWith("$ACTION_"),
  );
  return activateAccountFromHeaders(
    await headers(),
    containsClientFields,
    productionBetterAuthHttpService,
  );
}

export async function deleteAccountAction(
  _previousState: AccountDeletionState,
  formData: FormData,
): Promise<AccountDeletionState> {
  return deleteAccountFromForm(
    await headers(),
    formData,
    productionBetterAuthHttpService,
  );
}
