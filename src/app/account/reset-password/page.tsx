import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/account-experiences";
import { AccountShell } from "@/components/account-shell";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AccountShell
      eyebrow="Account recovery"
      title="Set a new password"
      summary="The reset credential is used only for this request and is removed from the address bar as soon as the page starts."
    >
      <ResetPasswordForm />
    </AccountShell>
  );
}
