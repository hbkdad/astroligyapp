import Link from "next/link";
import { HeaderUtilities } from "@/components/header-utilities";
import type { NumerologyViewState } from "@/presentation/numerology-read-model";

export function NumerologyView({ state }: { state: NumerologyViewState }) {
  if (state.status !== "ready") return <Status state={state} />;
  const { model } = state;
  return (
    <>
      <a className="skip-link" href="#numerology-content">
        Skip to numerology content
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
        <nav aria-label="Numerology navigation">
          <Link href="/">Today</Link>
          <a href="#core-numbers">Core numbers</a>
          <a href="#personal-cycles">Cycles</a>
          <Link href="/timeline">Timeline</Link>
          <a href="#numerology-trace">Trace</a>
        </nav>
        <HeaderUtilities badge="Local deterministic demo" />
      </header>
      <main id="numerology-content" className="numerology-shell" tabIndex={-1}>
        <header className="numerology-intro">
          <p className="eyebrow">Personal numerology</p>
          <h1>{model.title}</h1>
          <p className="hero-summary">{model.subtitle}</p>
          <p className="numerology-convention">{model.convention}</p>
        </header>
        <section
          id="core-numbers"
          className="numerology-panel"
          aria-labelledby="core-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Pythagorean arithmetic</p>
              <h2 id="core-heading">Core numbers</h2>
            </div>
            <span>{model.core.length} traced results</span>
          </div>
          <ul className="number-card-grid">
            {model.core.map((item) => (
              <li key={item.key}>
                <p className="number-value">{item.value}</p>
                <h3>
                  {item.label}
                  {item.masterNumber ? <small> master number</small> : null}
                </h3>
                <details>
                  <summary>View calculation trace</summary>
                  <p>
                    <strong>Normalized tokens:</strong> {item.tokenLabel}
                  </p>
                  <ol>
                    {item.operations.map((operation, index) => (
                      <li key={`${item.key}:${index}`}>{operation}</li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        </section>
        <section
          id="personal-cycles"
          className="numerology-panel"
          aria-labelledby="cycles-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Explicit local boundaries</p>
              <h2 id="cycles-heading">Personal cycles</h2>
            </div>
          </div>
          {model.cycles.length ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Personal numerology cycle table"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Local date</th>
                    <th scope="col">Cycle</th>
                    <th scope="col">Value</th>
                    <th scope="col">Timezone</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {model.cycles.map((cycle) => (
                    <tr key={cycle.id}>
                      <td>
                        <time dateTime={cycle.dateTime}>{cycle.dateLabel}</time>
                      </td>
                      <th scope="row">{cycle.label}</th>
                      <td>
                        {cycle.value}
                        {cycle.masterNumber ? " (master number)" : ""}
                      </td>
                      <td>{cycle.timezone}</td>
                      <td>
                        <code>{cycle.id}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-message">
              No explicit personal-cycle boundaries are available.
            </p>
          )}
        </section>
        <section
          id="numerology-trace"
          className="panel trace-panel numerology-trace"
          aria-labelledby="numerology-trace-heading"
        >
          <div>
            <p className="section-kicker">Reproducibility</p>
            <h2 id="numerology-trace-heading">Numerology source trace</h2>
            <p>
              Every value preserves normalized input tokens and reduction
              operations. No traditional meaning is added on this page.
            </p>
          </div>
          <details>
            <summary>View strategy and inputs</summary>
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
          Numerology is presented as an interpretive tradition. This page shows
          deterministic arithmetic, not scientific prediction or advice.
        </p>
        <p>Numerology read model {model.version}</p>
      </footer>
    </>
  );
}

function Status({
  state,
}: {
  state: Exclude<NumerologyViewState, { status: "ready" }>;
}) {
  const message =
    state.status === "loading"
      ? "Preparing traceable numerology results…"
      : state.message;
  return (
    <main
      className="status-shell"
      aria-live={state.status === "loading" ? "polite" : "assertive"}
    >
      <p className="eyebrow">Personal numerology</p>
      <h1>
        {state.status === "locked"
          ? "Your numerology profile is private"
          : state.status === "unavailable"
            ? "Numerology data is unavailable"
            : state.status === "error"
              ? "The numerology view is unavailable"
              : "Calculating your profile"}
      </h1>
      <p>{message}</p>
      {state.status !== "loading" ? (
        <Link href="/">Return to Today</Link>
      ) : null}
    </main>
  );
}
