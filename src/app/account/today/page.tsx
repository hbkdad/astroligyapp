import type { Metadata } from "next";
import { headers } from "next/headers";

import { loadPersonalTodayAction } from "@/app/account/today/actions";
import { PersonalTodaySelector } from "@/components/personal-today-selector";
import { toPersonalTodayProfileOption } from "@/presentation/personal-today-state";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";
import { loadPrivateProfilesFromHeaders } from "@/server/private-profile-action";

export const metadata: Metadata = {
  title: "Private Today",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PersonalTodayPage() {
  const state = await loadPrivateProfilesFromHeaders(
    await headers(),
    productionBetterAuthHttpService,
  );
  const profiles =
    state.status === "ready"
      ? state.profiles.map(toPersonalTodayProfileOption)
      : [];
  return (
    <PersonalTodaySelector
      profiles={profiles}
      initialStatus={state.status}
      action={loadPersonalTodayAction}
    />
  );
}
