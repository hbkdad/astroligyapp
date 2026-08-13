import type { Metadata } from "next";

import { SignUpForm } from "@/components/account-experiences";
import { AccountShell } from "@/components/account-shell";

export const metadata: Metadata = {
  title: "Create account",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <AccountShell
      eyebrow="Account entry"
      title="Create an account"
      summary="Start with the minimum account details. Birth data and personal profiles are collected only in later, purpose-specific flows."
    >
      <SignUpForm />
    </AccountShell>
  );
}
