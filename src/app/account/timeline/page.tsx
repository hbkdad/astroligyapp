import type { Metadata } from "next";
import { headers } from "next/headers";

import { loadPersonalTimelineAction } from "@/app/account/timeline/actions";
import { PersonalTimelineSelector } from "@/components/personal-timeline-selector";
import { toPersonalTimelineProfileOption } from "@/presentation/personal-timeline-state";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";
import { loadPrivateProfilesFromHeaders } from "@/server/private-profile-action";

export const metadata: Metadata = {
  title: "Private Timeline",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function PersonalTimelinePage() {
  const state = await loadPrivateProfilesFromHeaders(
    await headers(),
    productionBetterAuthHttpService,
  );
  return (
    <PersonalTimelineSelector
      profiles={
        state.status === "ready"
          ? state.profiles.map(toPersonalTimelineProfileOption)
          : []
      }
      initialStatus={state.status}
      action={loadPersonalTimelineAction}
    />
  );
}
