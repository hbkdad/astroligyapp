"use server";

import "server-only";

import { headers } from "next/headers";

import type { PersonalTodayActionState } from "@/presentation/personal-today-state";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";
import { loadPersonalTodayFromForm } from "@/server/personal-today-action";

export async function loadPersonalTodayAction(
  _previousState: PersonalTodayActionState,
  formData: FormData,
): Promise<PersonalTodayActionState> {
  return loadPersonalTodayFromForm(
    await headers(),
    formData,
    productionBetterAuthHttpService,
  );
}
