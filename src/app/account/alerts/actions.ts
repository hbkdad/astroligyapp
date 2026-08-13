"use server";

import "server-only";

import { headers } from "next/headers";
import type { NotificationPreferenceActionState } from "@/presentation/notification-preference-state";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";
import {
  loadNotificationPreferencesFromForm,
  replaceNotificationPreferencesFromForm,
} from "@/server/notification-preference-action";

export async function loadNotificationPreferencesAction(
  _previousState: NotificationPreferenceActionState,
  formData: FormData,
) {
  return loadNotificationPreferencesFromForm(
    await headers(),
    formData,
    productionBetterAuthHttpService,
  );
}

export async function replaceNotificationPreferencesAction(
  _previousState: NotificationPreferenceActionState,
  formData: FormData,
) {
  return replaceNotificationPreferencesFromForm(
    await headers(),
    formData,
    productionBetterAuthHttpService,
  );
}
