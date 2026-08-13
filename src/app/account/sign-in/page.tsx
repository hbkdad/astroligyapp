import type { Metadata } from "next";

import { SignInForm } from "@/components/account-experiences";
import { AccountShell } from "@/components/account-shell";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <AccountShell
      eyebrow="Account entry"
      title="Welcome back"
      summary="Use your verified email and password. Private data remains protected by server-side session and ownership checks."
    >
      <SignInForm />
    </AccountShell>
  );
}
