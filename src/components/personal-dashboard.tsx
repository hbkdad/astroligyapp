import Link from "next/link";
import type { ReactNode } from "react";

import type { DashboardState } from "@/presentation/dashboard-read-model";

export function PersonalDashboard({ state }: { state: DashboardState }) {
  if (state.status !== "ready") return <DashboardStatus state={state} />;
  const { model } = state;
  return (
    <>
      <a className="skip-link" href="#dashboard-content">
        Skip to dashboard content
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#today"
          aria-label="Personal Cosmic Calendar home"
        >
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <span>Personal Cosmic Calendar</span>
        </a>
        <nav aria-label="Dashboard sections">
          <a href="#today">Today</a>
          <a href="#signals">Signals</a>
          <a href="#categories">Categories</a>
          <Link href="/chart">My chart</Link>
          <a href="#trace">Trace</a>
        </nav>
        <span className="demo-badge">Local demo data</span>
      </header>

      <main id="dashboard-content" className="dashboard-shell" tabIndex={-1}>
        <section
          id="today"
          className="hero-panel"
          aria-labelledby="today-title"
        >
          <div>
            <p className="eyebrow">{model.eyebrow}</p>
            <h1 id="today-title">{model.title}</h1>
            <p className="hero-summary">{model.summary}</p>
            <dl className="date-meta">
              <div>
                <dt>Date</dt>
                <dd>{model.dateLabel}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{model.timezoneLabel}</dd>
              </div>
            </dl>
          </div>
          <div className="moon-card" aria-labelledby="moon-heading">
            <div className="moon-orbit" aria-hidden="true">
              <span />
            </div>
            <div>
              <p className="section-kicker">Moon now</p>
              <h2 id="moon-heading">{model.moon.phase}</h2>
              <p className="moon-sign">in {model.moon.sign}</p>
              <p>{model.moon.illuminationLabel}</p>
              <p>{model.moon.geometryLabel}</p>
            </div>
          </div>
        </section>

        <div className="dashboard-grid">
          <section
            id="signals"
            className="panel span-two"
            aria-labelledby="signals-heading"
          >
            <div className="section-heading">
              <div>
                <p className="section-kicker">What is contributing</p>
                <h2 id="signals-heading">Strongest signals</h2>
              </div>
              <span>{model.signals.length} traced</span>
            </div>
            {model.signals.length ? (
              <ol className="signal-list">
                {model.signals.map((signal, index) => (
                  <li key={signal.id}>
                    <span className="signal-rank" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{signal.category}</h3>
                      <p>{signal.rationale}</p>
                      <code>{signal.sourceFactId}</code>
                    </div>
                    <strong>{signal.impactLabel}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyMessage>
                No configured category rules matched today’s facts.
              </EmptyMessage>
            )}
          </section>

          <section
            className="panel numerology-panel"
            aria-labelledby="numerology-heading"
          >
            <p className="section-kicker">Numerology cycle</p>
            <h2 id="numerology-heading">Your numbers</h2>
            {model.numerology.length ? (
              <dl className="number-list">
                {model.numerology.map((item) => (
                  <div key={item.key}>
                    <dt>{item.label}</dt>
                    <dd>
                      {item.value}
                      {item.masterNumber ? <small> master number</small> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <EmptyMessage>Numerology values are unavailable.</EmptyMessage>
            )}
          </section>

          <section
            id="categories"
            className="panel full-width"
            aria-labelledby="categories-heading"
          >
            <div className="section-heading">
              <div>
                <p className="section-kicker">Product heuristics</p>
                <h2 id="categories-heading">Category overview</h2>
              </div>
              <span>0–100 configured scale</span>
            </div>
            <p className="section-intro">
              These scores summarize configured contributions. They are
              interpretive product metrics, not scientific measurements.
            </p>
            <ul className="category-grid">
              {model.categories.map((category) => (
                <li key={category.key}>
                  <div>
                    <h3>{category.label}</h3>
                    <strong>{category.score}</strong>
                  </div>
                  <meter
                    min="0"
                    max="100"
                    value={category.score}
                    aria-label={`${category.label}: ${category.score} out of 100`}
                  >
                    {category.score} out of 100
                  </meter>
                  <p>
                    {category.confidenceLabel} · {category.sourceCountLabel}
                  </p>
                  <small>{category.heuristicLabel}</small>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="panel full-width"
            aria-labelledby="reflections-heading"
          >
            <div className="section-heading">
              <div>
                <p className="section-kicker">Fact, then reflection</p>
                <h2 id="reflections-heading">Reading notes</h2>
              </div>
            </div>
            {model.reflections.length ? (
              <div className="reflection-grid">
                {model.reflections.map((item) => (
                  <article key={item.id}>
                    <div className="fact-block">
                      <h3>Calculated fact</h3>
                      <p>{item.fact}</p>
                    </div>
                    <div className="interpretation-block">
                      <h3>Tradition-framed reflection</h3>
                      <p>{item.interpretation}</p>
                    </div>
                    <code>{item.sourceFactId}</code>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyMessage>
                No deterministic interpretation is available for these facts.
              </EmptyMessage>
            )}
          </section>

          <section
            id="trace"
            className="panel full-width trace-panel"
            aria-labelledby="trace-heading"
          >
            <div>
              <p className="section-kicker">Reproducibility</p>
              <h2 id="trace-heading">Calculation trace</h2>
              <p>
                Every displayed section retains the versions needed to identify
                its deterministic source.
              </p>
            </div>
            <details>
              <summary>View version trace</summary>
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
        </div>
      </main>
      <footer>
        <p>
          Astrology and numerology are presented as interpretive traditions for
          personal reflection—not as scientific prediction or medical, legal,
          financial, relationship, or safety advice.
        </p>
        <p>Dashboard read model {model.version}</p>
      </footer>
    </>
  );
}

function DashboardStatus({
  state,
}: {
  state: Exclude<DashboardState, { status: "ready" }>;
}) {
  const copy =
    state.status === "loading"
      ? "Preparing your traceable daily context…"
      : state.message;
  return (
    <main
      className="status-shell"
      aria-live={state.status === "loading" ? "polite" : "assertive"}
    >
      <p className="eyebrow">Personal Cosmic Calendar</p>
      <h1>
        {state.status === "locked"
          ? "Your dashboard is private"
          : state.status === "error"
            ? "The dashboard is unavailable"
            : "Building today’s context"}
      </h1>
      <p>{copy}</p>
      {state.status === "error" ? <Link href="/">Try again</Link> : null}
    </main>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return <p className="empty-message">{children}</p>;
}
