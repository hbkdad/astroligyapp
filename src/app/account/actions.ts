"use server";

import "server-only";

import { headers } from "next/headers";

import type { AccountActivationState } from "@/presentation/account-activation-state";
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
