import type { Metadata } from "next";

import { VerifyEmailForm } from "@/components/account-experiences";
import { AccountShell } from "@/components/account-shell";

export const metadata: Metadata = {
  title: "Verify email",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <AccountShell
      eyebrow="Email verification"
      title="Verify your email"
      summary="Verification links arrive by email and return only to a reviewed same-origin account path."
    >
      <VerifyEmailForm />
    </AccountShell>
  );
}
