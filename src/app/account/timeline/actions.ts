"use server";

import "server-only";

import { headers } from "next/headers";
import type { PersonalTimelineActionState } from "@/presentation/personal-timeline-state";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";
import { loadPersonalTimelineFromForm } from "@/server/personal-timeline-action";

export async function loadPersonalTimelineAction(
  _previousState: PersonalTimelineActionState,
  formData: FormData,
): Promise<PersonalTimelineActionState> {
  return loadPersonalTimelineFromForm(
    await headers(),
    formData,
    productionBetterAuthHttpService,
  );
}
