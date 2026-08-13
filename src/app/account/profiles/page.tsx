import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { mutatePrivateProfileAction } from "@/app/account/profiles/actions";
import { PrivateProfiles } from "@/components/private-profiles";
import { AccountShell } from "@/components/account-shell";
import { productionBetterAuthHttpService } from "@/server/better-auth-http-service";
import { loadPrivateProfilesFromHeaders } from "@/server/private-profile-action";

export const metadata: Metadata = {
  title: "Private profiles",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PrivateProfilesPage() {
  const state = await loadPrivateProfilesFromHeaders(
    await headers(),
    productionBetterAuthHttpService,
  );
  return (
    <AccountShell
      eyebrow="Private birth data"
      title="Saved profiles"
      summary="Manage the private inputs used by later chart and personal-calendar calculations."
    >
      {state.status === "ready" ? (
        <PrivateProfiles
          profiles={state.profiles}
          multipleProfilesAllowed={state.multipleProfilesAllowed}
          action={mutatePrivateProfileAction}
        />
      ) : state.status === "authenticate" ? (
        <section className="account-panel account-status" role="alert">
          <h2>Sign in again</h2>
          <p>A recent verified session is required to view private profiles.</p>
          <Link href="/account/sign-in">Return to sign in</Link>
        </section>
      ) : (
        <section className="account-panel account-status" role="alert">
          <h2>Private profiles are temporarily unavailable</h2>
          <p>No private data was displayed or changed. Try again later.</p>
          <Link href="/account">Return to account</Link>
        </section>
      )}
    </AccountShell>
  );
}
