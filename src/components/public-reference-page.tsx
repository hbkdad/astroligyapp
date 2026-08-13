import Link from "next/link";

import { HeaderUtilities } from "@/components/header-utilities";
import { breadcrumbJsonLd } from "@/presentation/public-seo";

export interface PublicReferenceSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly points?: readonly string[];
}

export function PublicReferencePage({
  eyebrow,
  title,
  summary,
  currentLabel,
  currentPath,
  sections,
  related,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  currentLabel: string;
  currentPath: string;
  sections: readonly PublicReferenceSection[];
  related: readonly Readonly<{
    label: string;
    href: string;
    description: string;
  }>[];
}) {
  const breadcrumbs = [
    { label: "Home", path: "/" },
    { label: currentLabel, path: currentPath },
  ] as const;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(breadcrumbs) }}
      />
      <a className="skip-link" href="#reference-content">
        Skip to reference content
      </a>
      <header className="site-header">
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
        <nav aria-label="Reference navigation">
          <Link href="/astrology">Astrology</Link>
          <Link href="/moon-phase">Moon phases</Link>
          <Link href="/numerology/life-path">Life Path</Link>
          <Link href="/horoscope/aries">Daily sky</Link>
        </nav>
        <HeaderUtilities badge="Public reference" />
      </header>
      <main id="reference-content" className="horoscope-shell" tabIndex={-1}>
        <nav aria-label="Breadcrumb" className="public-breadcrumb">
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li aria-current="page">{currentLabel}</li>
          </ol>
        </nav>
        <header className="horoscope-hero">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="hero-summary">{summary}</p>
          </div>
        </header>
        {sections.map((section) => (
          <section className="horoscope-panel" key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.points ? (
              <ul>
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        <section className="horoscope-panel" aria-labelledby="related-heading">
          <h2 id="related-heading">Continue exploring</h2>
          <ul className="reference-link-grid">
            {related.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
                <p>{item.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer>
        <p>
          Astrology and numerology are interpretive traditions, not medical,
          legal, financial, relationship, or safety advice.
        </p>
      </footer>
    </>
  );
}
