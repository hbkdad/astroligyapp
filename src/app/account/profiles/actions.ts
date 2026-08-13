"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  mutatePrivateProfileFromForm,
  type PrivateProfileActionState,
} from "@/server/private-profile-action";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";

export async function mutatePrivateProfileAction(
  _previousState: PrivateProfileActionState,
  formData: FormData,
): Promise<PrivateProfileActionState> {
  const result = await mutatePrivateProfileFromForm(
    await headers(),
    formData,
    productionBetterAuthHttpService,
  );
  if (result.status === "saved" || result.status === "deleted")
    revalidatePath("/account/profiles");
  return result;
}
