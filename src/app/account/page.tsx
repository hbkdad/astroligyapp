import type { Metadata } from "next";

import { activateAccountAction } from "@/app/account/actions";
import { AccountOverview } from "@/components/account-experiences";
import { AccountShell } from "@/components/account-shell";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <AccountShell
      eyebrow="Private account"
      title="Your account"
      summary="Check the current session or choose a secure account entry path."
    >
      <AccountOverview activationAction={activateAccountAction} />
    </AccountShell>
  );
}
