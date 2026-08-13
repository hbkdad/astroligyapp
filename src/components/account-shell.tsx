import Link from "next/link";
import type { ReactNode } from "react";

import { AccountNavigation } from "@/components/account-navigation";

export function AccountShell({
  title,
  eyebrow,
  summary,
  children,
}: {
  title: string;
  eyebrow: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#account-content">
        Skip to account content
      </a>
      <header className="site-header account-site-header">
        <Link
          className="brand"
          href="/"
          aria-label="Personal Cosmic Calendar home"
        >
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <span>Personal Cosmic Calendar</span>
        </Link>
        <nav aria-label="Account navigation">
          <Link href="/">Today</Link>
          <Link href="/moon">Moon</Link>
          <Link href="/timeline">Timeline</Link>
        </nav>
        <AccountNavigation />
      </header>
      <main id="account-content" className="account-shell" tabIndex={-1}>
        <header className="account-intro">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{summary}</p>
        </header>
        {children}
        <p className="account-claims-note">
          Astrology and numerology are interpretive traditions, not medical,
          legal, financial, relationship, or safety advice.
        </p>
      </main>
    </>
  );
}
