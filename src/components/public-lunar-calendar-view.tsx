import Link from "next/link";
import { HeaderUtilities } from "@/components/header-utilities";
import { breadcrumbJsonLd } from "@/presentation/public-seo";
import type { toPublicLunarCalendarReadModel } from "@/presentation/public-lunar-calendar-read-model";

type Model = ReturnType<typeof toPublicLunarCalendarReadModel>;

export function PublicLunarCalendarView({ model }: { model: Model }) {
  const breadcrumbs = [
    { label: "Home", path: "/" },
    { label: "Moon phases", path: "/moon-phase" },
    { label: model.date, path: `/moon-phase/${model.date}` },
  ] as const;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(breadcrumbs) }}
      />
      <a className="skip-link" href="#lunar-date-content">
        Skip to Moon date content
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
        <nav aria-label="Moon calendar navigation">
          <Link href="/moon-phase">Moon guide</Link>
          <Link href="/astrology">Astrology</Link>
          <Link href="/horoscope/cancer">Daily sky</Link>
        </nav>
        <HeaderUtilities badge="UTC lunar calendar" />
      </header>
      <main id="lunar-date-content" className="horoscope-shell" tabIndex={-1}>
        <nav aria-label="Breadcrumb" className="public-breadcrumb">
          <ol>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/moon-phase">Moon phases</Link>
            </li>
            <li aria-current="page">{model.date}</li>
          </ol>
        </nav>
        <header className="horoscope-hero">
          <div>
            <p className="eyebrow">Public Moon calendar · UTC</p>
            <h1>{model.title}</h1>
            <p className="hero-summary">
              Validated geocentric lunar geometry at UTC noon, followed by
              refined Moon events during the next seven days.
            </p>
          </div>
        </header>
        <section className="horoscope-panel" aria-labelledby="moon-date-facts">
          <h2 id="moon-date-facts">Moon at UTC noon</h2>
          <dl className="horoscope-meta">
            <div>
              <dt>Phase</dt>
              <dd>{model.phase}</dd>
            </div>
            <div>
              <dt>Moon sign</dt>
              <dd>{model.moonSign}</dd>
            </div>
            <div>
              <dt>Illumination</dt>
              <dd>{model.illumination}</dd>
            </div>
            <div>
              <dt>Mean-cycle age</dt>
              <dd>{model.age}</dd>
            </div>
            <div>
              <dt>Geometry</dt>
              <dd>{model.geometry}</dd>
            </div>
            <div>
              <dt>Trend</dt>
              <dd>{model.trend}</dd>
            </div>
          </dl>
          <p>
            Sampled at{" "}
            <time dateTime={`${model.date}T12:00:00.000Z`}>
              {model.effectiveLabel}
            </time>
            . Illumination and age are estimates; they are not used to time
            events.
          </p>
        </section>
        <section
          className="horoscope-panel"
          aria-labelledby="upcoming-lunar-events"
        >
          <h2 id="upcoming-lunar-events">
            Refined events in the next seven days
          </h2>
          {model.events.length ? (
            <ol className="horoscope-fact-list">
              {model.events.map((event) => (
                <li key={event.id}>
                  <article>
                    <h3>{event.title}</h3>
                    <p>
                      <time dateTime={event.instant}>{event.instantLabel}</time>
                    </p>
                    <p>Angular error at refined point: {event.angularError}</p>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              No primary phase or Moon-sign ingress was found in this bounded
              interval.
            </p>
          )}
        </section>
        <nav
          className="date-pagination"
          aria-label="Adjacent Moon calendar dates"
        >
          {model.previousDate ? (
            <Link href={`/moon-phase/${model.previousDate}`}>
              ← {model.previousDate}
            </Link>
          ) : (
            <span>Start of published window</span>
          )}
          {model.nextDate ? (
            <Link href={`/moon-phase/${model.nextDate}`}>
              {model.nextDate} →
            </Link>
          ) : (
            <span>End of published window</span>
          )}
        </nav>
        <section className="horoscope-panel">
          <h2>Calculation trace</h2>
          <details>
            <summary>View provider and engine versions</summary>
            <dl>
              {model.trace.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      </main>
      <footer>
        <p>
          Geocentric UTC facts do not describe local Moon visibility or rise/set
          conditions. Astrology is an interpretive tradition, not scientific
          advice.
        </p>
      </footer>
    </>
  );
}

export function PublicLunarCalendarUnavailable() {
  return (
    <main className="status-shell">
      <p className="eyebrow">Public Moon calendar</p>
      <h1>This Moon date is temporarily unavailable</h1>
      <p>No partial or estimated event schedule is shown.</p>
      <Link href="/moon-phase">Read the Moon phase guide</Link>
    </main>
  );
}
