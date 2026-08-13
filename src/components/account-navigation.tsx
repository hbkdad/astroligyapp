"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  AUTH_SESSION_CHANGED_EVENT,
  getAuthSession,
  signOut,
  type AuthSessionResult,
} from "@/presentation/auth-http-client";

type NavigationState = AuthSessionResult | Readonly<{ status: "checking" }>;

export function AccountNavigation() {
  const [state, setState] = useState<NavigationState>({ status: "checking" });
  const [signingOut, setSigningOut] = useState(false);

  const refresh = useCallback(() => {
    void getAuthSession().then(setState);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, refresh);
    return () =>
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, refresh);
  }, [refresh]);

  async function handleSignOut() {
    setSigningOut(true);
    const result = await signOut();
    setSigningOut(false);
    if (result.status === "accepted") {
      setState({ status: "anonymous" });
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
    } else if (result.status === "rate-limited") {
      setState({ status: "rate-limited" });
    } else {
      setState({ status: "unavailable" });
    }
  }

  if (state.status === "authenticated") {
    return (
      <div className="account-navigation" aria-live="polite">
        <Link href="/account/today">My Today</Link>
        <Link href="/account/timeline">My Timeline</Link>
        <Link href="/account">{firstName(state.user.name)}</Link>
        <button type="button" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <div className="account-navigation" aria-live="polite">
      <Link href="/account/sign-in">
        {state.status === "checking" ? "Account" : "Sign in"}
      </Link>
      {state.status === "unavailable" || state.status === "rate-limited" ? (
        <button type="button" onClick={refresh}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function firstName(name: string): string {
  const value = name.trim().split(/\s+/u)[0];
  return value && value.length <= 40 ? value : "Account";
}
