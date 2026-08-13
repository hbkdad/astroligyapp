import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  loadNotificationPreferencesAction,
  replaceNotificationPreferencesAction,
} from "@/app/account/alerts/actions";
import { NotificationPreferenceSelector } from "@/components/notification-preference-selector";
import { toNotificationProfileOption } from "@/presentation/notification-preference-state";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";
import { loadPrivateProfilesFromHeaders } from "@/server/private-profile-action";

export const metadata: Metadata = {
  title: "Private Alerts",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  const state = await loadPrivateProfilesFromHeaders(
    await headers(),
    productionBetterAuthHttpService,
  );
  return (
    <NotificationPreferenceSelector
      profiles={
        state.status === "ready"
          ? state.profiles.map(toNotificationProfileOption)
          : []
      }
      initialStatus={state.status}
      loadAction={loadNotificationPreferencesAction}
      replaceAction={replaceNotificationPreferencesAction}
    />
  );
}
