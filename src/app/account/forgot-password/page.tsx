import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/account-experiences";
import { AccountShell } from "@/components/account-shell";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AccountShell
      eyebrow="Account recovery"
      title="Reset a forgotten password"
      summary="Request a time-limited reset link without revealing whether an email address belongs to an account."
    >
      <ForgotPasswordForm />
    </AccountShell>
  );
}
