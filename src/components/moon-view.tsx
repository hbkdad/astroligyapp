import Link from "next/link";

import type { MoonViewState } from "@/presentation/moon-read-model";

export function MoonView({ state }: { state: MoonViewState }) {
  if (state.status !== "ready") return <MoonStatus state={state} />;
  const { model } = state;
  return (
    <>
      <a className="skip-link" href="#moon-content">
        Skip to Moon content
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
        <nav aria-label="Moon navigation">
          <Link href="/">Today</Link>
          <Link href="/numerology">Numerology</Link>
          <a href="#current-moon">Moon now</a>
          <a href="#upcoming-moon">Upcoming</a>
          <Link href="/timeline">Timeline</Link>
          <a href="#moon-trace">Trace</a>
        </nav>
        <span className="demo-badge">Local calculated demo</span>
      </header>
      <main id="moon-content" className="moon-shell" tabIndex={-1}>
        <section
          id="current-moon"
          className="moon-hero"
          aria-labelledby="moon-title"
        >
          <div>
            <p className="eyebrow">{model.eyebrow}</p>
            <h1 id="moon-title">{model.title}</h1>
            <p className="hero-summary">
              Current positional geometry, personal lunar aspects, and refined
              upcoming events—kept separate from interpretation.
            </p>
            <p className="moon-effective">
              Calculated for{" "}
              <time dateTime={model.effectiveAt}>{model.effectiveLabel}</time>
            </p>
          </div>
          <div className="moon-now-card">
            <div className="moon-phase-visual" aria-hidden="true">
              <span />
            </div>
            <dl>
              <div>
                <dt>Phase</dt>
                <dd>{model.current.phase}</dd>
              </div>
              <div>
                <dt>Moon sign</dt>
                <dd>{model.current.sign}</dd>
              </div>
              <div>
                <dt>Illumination</dt>
                <dd>{model.current.illumination}</dd>
              </div>
              <div>
                <dt>Mean-cycle age</dt>
                <dd>{model.current.age}</dd>
              </div>
              <div>
                <dt>Geometry</dt>
                <dd>{model.current.geometry}</dd>
              </div>
              <div>
                <dt>Trend</dt>
                <dd>{model.current.trend}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="moon-panel" aria-labelledby="personal-moon-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Personal geometry</p>
              <h2 id="personal-moon-heading">Moon to natal chart</h2>
            </div>
            <span>{model.aspects.length} major aspects</span>
          </div>
          {model.aspects.length ? (
            <ul className="moon-aspects">
              {model.aspects.map((aspect) => (
                <li key={aspect.id}>
                  <h3>{aspect.title}</h3>
                  <p>
                    {aspect.orb} · {aspect.phase}
                  </p>
                  <code>{aspect.id}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-message">
              No configured major Moon-to-natal aspects are active at this
              instant.
            </p>
          )}
        </section>

        <section
          id="upcoming-moon"
          className="moon-panel"
          aria-labelledby="upcoming-moon-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Provider-refined events</p>
              <h2 id="upcoming-moon-heading">Upcoming Moon events</h2>
            </div>
            <span>{model.upcoming.length} events</span>
          </div>
          {model.upcoming.length ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Upcoming Moon events table"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Event</th>
                    <th scope="col">Type</th>
                    <th scope="col">Time</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {model.upcoming.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <time dateTime={event.dateTime}>{event.dateLabel}</time>
                      </td>
                      <th scope="row">{event.title}</th>
                      <td>{event.type}</td>
                      <td>{event.timeLabel}</td>
                      <td>
                        <code>{event.id}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-message">
              No refined lunar events are available in this interval.
            </p>
          )}
        </section>

        <aside className="moon-unavailable" aria-labelledby="rise-set-heading">
          <p className="section-kicker">Location-dependent data</p>
          <h2 id="rise-set-heading">Moonrise and moonset unavailable</h2>
          <p>
            No location-aware rise/set provider is selected. The page does not
            substitute plausible-looking times.
          </p>
        </aside>

        <section
          id="moon-trace"
          className="panel trace-panel moon-trace"
          aria-labelledby="moon-trace-heading"
        >
          <div>
            <p className="section-kicker">Reproducibility</p>
            <h2 id="moon-trace-heading">Moon calculation trace</h2>
            <p>
              Approximate illumination and mean-cycle age are labeled; event
              instants come only from refined provider observations.
            </p>
          </div>
          <details>
            <summary>View Moon source versions</summary>
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
          Astrology is presented as an interpretive tradition, not scientific
          prediction or medical, legal, financial, relationship, or safety
          advice.
        </p>
        <p>Moon read model {model.version}</p>
      </footer>
    </>
  );
}

function MoonStatus({
  state,
}: {
  state: Exclude<MoonViewState, { status: "ready" }>;
}) {
  const message =
    state.status === "loading"
      ? "Preparing validated Moon facts…"
      : state.message;
  return (
    <main
      className="status-shell"
      aria-live={state.status === "loading" ? "polite" : "assertive"}
    >
      <p className="eyebrow">Personal Moon</p>
      <h1>
        {state.status === "locked"
          ? "Your personal Moon view is private"
          : state.status === "unavailable"
            ? "Moon data is unavailable"
            : state.status === "error"
              ? "The Moon view is unavailable"
              : "Calculating the Moon view"}
      </h1>
      <p>{message}</p>
      {state.status !== "loading" ? (
        <Link href="/">Return to Today</Link>
      ) : null}
    </main>
  );
}
