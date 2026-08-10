import Link from "next/link";

import type { PublicHoroscopeViewState } from "@/presentation/public-horoscope-read-model";

export function PublicHoroscopeView({
  state,
}: {
  state: PublicHoroscopeViewState;
}) {
  if (state.status !== "ready") return <PublicHoroscopeStatus state={state} />;
  const { model } = state;
  return (
    <>
      <a className="skip-link" href="#horoscope-content">
        Skip to horoscope content
      </a>
      <header className="site-header horoscope-header">
        <Link
          className="brand"
          href="/"
          prefetch={false}
          aria-label="Personal Cosmic Calendar home"
        >
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <span>Personal Cosmic Calendar</span>
        </Link>
        <nav aria-label="Public horoscope navigation">
          <Link href="/" prefetch={false}>
            Today
          </Link>
          <a href="#signs">Signs</a>
          <a href="#daily-facts">Daily facts</a>
          <a href="#horoscope-trace">Trace</a>
        </nav>
        <span className="demo-badge">No-index local demo</span>
      </header>

      <main id="horoscope-content" className="horoscope-shell" tabIndex={-1}>
        <header className="horoscope-hero">
          <div>
            <p className="eyebrow">
              Public daily reflection · {model.dateLabel}
            </p>
            <h1>{model.title}</h1>
            <p className="hero-summary">{model.summary}</p>
          </div>
          <dl className="horoscope-meta">
            <div>
              <dt>Calendar date</dt>
              <dd>
                <time dateTime={model.date}>{model.dateLabel}</time>
              </dd>
            </div>
            <div>
              <dt>Sky sample</dt>
              <dd>{model.sampleLabel}</dd>
            </div>
            <div>
              <dt>Public target</dt>
              <dd>Tropical {model.signLabel} midpoint model</dd>
            </div>
          </dl>
        </header>

        <aside className="horoscope-demo-note" aria-label="Demo limitation">
          <strong>Historical local demo.</strong> This fixed January 1, 2000
          reading verifies the presentation without a live production data call.
          It is intentionally excluded from search indexing.
        </aside>

        <nav
          id="signs"
          className="sign-navigation"
          aria-label="Public horoscope signs"
        >
          <p className="section-kicker">Choose a sign model</p>
          <ul>
            {model.signNavigation.map((item) => (
              <li key={item.sign}>
                <Link
                  href={item.href}
                  prefetch={false}
                  aria-current={item.current ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section
          id="daily-facts"
          className="horoscope-panel"
          aria-labelledby="daily-facts-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">One shared sky, two clear layers</p>
              <h2 id="daily-facts-heading">Calculated facts and reflections</h2>
            </div>
            <span>{model.items.length} source facts</span>
          </div>
          {model.items.length ? (
            <ol className="horoscope-fact-list">
              {model.items.map((item) => (
                <li key={item.id}>
                  <article>
                    <header>
                      <p className="event-category">
                        {item.kind === "lunar"
                          ? "Shared lunar context"
                          : "Shared-sky aspect"}
                      </p>
                      <h3>{item.title}</h3>
                    </header>
                    {item.status === "rendered" ? (
                      <div className="horoscope-copy-grid">
                        <section aria-label={`Calculated fact: ${item.title}`}>
                          <h4>Calculated fact</h4>
                          <p>{item.factText}</p>
                        </section>
                        <section
                          className="horoscope-reflection"
                          aria-label={`Tradition-framed reflection: ${item.title}`}
                        >
                          <h4>Tradition-framed reflection</h4>
                          <p>{item.reflectionText}</p>
                        </section>
                      </div>
                    ) : (
                      <p className="empty-message">{item.fallbackText}</p>
                    )}
                    <code>{item.sourceReference}</code>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-message">
              No public facts are available for this sign and date.
            </p>
          )}
        </section>

        <section
          id="horoscope-trace"
          className="panel trace-panel horoscope-trace"
          aria-labelledby="horoscope-trace-heading"
        >
          <div>
            <p className="section-kicker">Reproducibility</p>
            <h2 id="horoscope-trace-heading">Public reading source trace</h2>
            <p>
              This view maps a validated aggregate. It performs no ephemeris,
              lunar, aspect, scoring, AI, or personalization work in React.
            </p>
          </div>
          <details>
            <summary>View calculation and content versions</summary>
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
        <p>{model.disclaimer}</p>
        <p>
          Public read model {model.version} · source {model.sourceVersion}
        </p>
      </footer>
    </>
  );
}

function PublicHoroscopeStatus({
  state,
}: {
  state: Exclude<PublicHoroscopeViewState, { status: "ready" }>;
}) {
  const loading = state.status === "loading";
  return (
    <main className="status-shell" aria-live={loading ? "polite" : "assertive"}>
      <p className="eyebrow">Public daily reflection</p>
      <h1>
        {loading
          ? "Preparing the shared sky"
          : state.status === "unavailable"
            ? "This public reading is unavailable"
            : "The public reading could not be shown"}
      </h1>
      <p>
        {loading
          ? "Mapping calculated facts into a general sign reflection…"
          : state.message}
      </p>
      {!loading ? <Link href="/">Return to Today</Link> : null}
    </main>
  );
}
