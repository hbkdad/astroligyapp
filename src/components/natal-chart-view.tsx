import Link from "next/link";

import type { NatalChartViewState } from "@/presentation/natal-chart-read-model";

export function NatalChartView({ state }: { state: NatalChartViewState }) {
  if (state.status !== "ready") return <ChartStatus state={state} />;
  const { model } = state;
  return (
    <>
      <a className="skip-link" href="#chart-content">
        Skip to chart content
      </a>
      <header className="site-header chart-header">
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
        <nav aria-label="Chart navigation">
          <Link href="/">Today</Link>
          <a href="#placements">Placements</a>
          <a href="#aspects">Aspects</a>
          <a href="#chart-trace">Trace</a>
        </nav>
        <span className="demo-badge">Sourced demo chart</span>
      </header>

      <main id="chart-content" className="chart-shell" tabIndex={-1}>
        <header className="chart-intro">
          <div>
            <p className="eyebrow">My chart</p>
            <h1>{model.title}</h1>
            <p>{model.subtitle}</p>
          </div>
          <p className="chart-orientation">{model.orientationLabel}</p>
        </header>

        <section className="chart-visual-panel" aria-labelledby="wheel-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Whole Sign houses</p>
              <h2 id="wheel-heading">Chart wheel</h2>
            </div>
            <span>
              {model.placements.length} bodies · {model.aspects.length} major
              aspects
            </span>
          </div>
          <div className="chart-wheel-wrap">
            <svg
              className="chart-wheel"
              viewBox="0 0 600 600"
              role="img"
              aria-labelledby="chart-wheel-title chart-wheel-description"
            >
              <title id="chart-wheel-title">
                Accessible tropical natal chart wheel
              </title>
              <desc id="chart-wheel-description">
                Twelve zodiac signs and Whole Sign houses, ten linked planet
                markers, ASC to DSC and MC to IC axes, and major aspect lines.
                Complete values follow in tables.
              </desc>
              <circle className="wheel-ring outer" cx="300" cy="300" r="286" />
              <circle className="wheel-ring zodiac" cx="300" cy="300" r="250" />
              <circle className="wheel-ring houses" cx="300" cy="300" r="115" />
              {model.aspects.map((aspect) => (
                <line
                  key={aspect.id}
                  className={`aspect-line aspect-${aspect.type.toLowerCase()}`}
                  x1={aspect.x1}
                  y1={aspect.y1}
                  x2={aspect.x2}
                  y2={aspect.y2}
                >
                  <title>{`${aspect.firstBody} ${aspect.type} ${aspect.secondBody}, orb ${aspect.orbLabel}`}</title>
                </line>
              ))}
              {model.houses.map((house) => (
                <g key={house.number}>
                  <line
                    className="house-line"
                    x1={house.x1}
                    y1={house.y1}
                    x2={house.x2}
                    y2={house.y2}
                  />
                  <text
                    className="house-number"
                    x={house.labelX}
                    y={house.labelY}
                  >
                    {house.number}
                  </text>
                </g>
              ))}
              {model.axes.map((axis) => (
                <g key={axis.id}>
                  <line
                    className={`angle-axis ${axis.id}`}
                    x1={axis.x1}
                    y1={axis.y1}
                    x2={axis.x2}
                    y2={axis.y2}
                  />
                  <text
                    className="angle-label"
                    x={axis.startLabelX}
                    y={axis.startLabelY}
                  >
                    {axis.startLabel}
                  </text>
                  <text
                    className="angle-label"
                    x={axis.endLabelX}
                    y={axis.endLabelY}
                  >
                    {axis.endLabel}
                  </text>
                </g>
              ))}
              {model.signs.map((sign) => (
                <text
                  key={sign.key}
                  className="zodiac-glyph"
                  x={sign.x}
                  y={sign.y}
                  aria-label={sign.label}
                >
                  {sign.glyph}
                </text>
              ))}
              {model.placements.map((placement) => (
                <a
                  key={placement.body}
                  className="planet-node"
                  href={`#placement-${placement.body}`}
                  aria-label={`${placement.accessibleLabel}. Jump to details.`}
                >
                  <circle cx={placement.x} cy={placement.y} r="15" />
                  <text x={placement.x} y={placement.y}>
                    {placement.glyph}
                  </text>
                  <title>{placement.accessibleLabel}</title>
                </a>
              ))}
              <circle className="wheel-center" cx="300" cy="300" r="8" />
            </svg>
          </div>
          <p className="chart-visual-note">
            Select or focus a planet marker to jump to its complete placement
            details. The tables below are the authoritative nonvisual
            representation.
          </p>
        </section>

        <section
          id="placements"
          className="chart-data-panel"
          aria-labelledby="placements-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Exact chart facts</p>
              <h2 id="placements-heading">Placements</h2>
            </div>
          </div>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Natal placements table"
            aria-describedby="placement-table-note"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Body</th>
                  <th scope="col">Sign and degree</th>
                  <th scope="col">House</th>
                  <th scope="col">Longitude</th>
                  <th scope="col">Major aspects</th>
                </tr>
              </thead>
              <tbody>
                {model.placements.map((placement) => (
                  <tr id={`placement-${placement.body}`} key={placement.body}>
                    <th scope="row">
                      <span aria-hidden="true">{placement.glyph}</span>{" "}
                      {placement.bodyLabel}
                    </th>
                    <td>{placement.degreeLabel}</td>
                    <td>{placement.houseNumber}</td>
                    <td>{placement.longitudeLabel}</td>
                    <td>{placement.aspectCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p id="placement-table-note" className="table-note">
            All longitudes are normalized tropical ecliptic longitudes in [0°,
            360°).
          </p>
        </section>

        <section
          id="aspects"
          className="chart-data-panel"
          aria-labelledby="aspects-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Configured major aspects</p>
              <h2 id="aspects-heading">Aspect table</h2>
            </div>
            <span>Orb strength is a configured metric</span>
          </div>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Natal aspects table"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">First body</th>
                  <th scope="col">Aspect</th>
                  <th scope="col">Second body</th>
                  <th scope="col">Orb</th>
                  <th scope="col">Phase</th>
                  <th scope="col">Orb strength</th>
                </tr>
              </thead>
              <tbody>
                {model.aspects.map((aspect) => (
                  <tr key={aspect.id}>
                    <th scope="row">{aspect.firstBody}</th>
                    <td>{aspect.type}</td>
                    <td>{aspect.secondBody}</td>
                    <td>{aspect.orbLabel}</td>
                    <td>{aspect.phase}</td>
                    <td>{aspect.strengthLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="chart-trace"
          className="panel trace-panel chart-trace"
          aria-labelledby="chart-trace-heading"
        >
          <div>
            <p className="section-kicker">Reproducibility</p>
            <h2 id="chart-trace-heading">Chart trace</h2>
            <p>
              This visual reads a validated natal aggregate. It performs no
              ephemeris, zodiac, house, or aspect calculation.
            </p>
          </div>
          <details>
            <summary>View chart versions and sources</summary>
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
          This sourced demo is for visualization validation. Astrology is
          presented as an interpretive tradition, not scientific prediction or
          high-stakes advice.
        </p>
        <p>Natal chart read model {model.version}</p>
      </footer>
    </>
  );
}

function ChartStatus({
  state,
}: {
  state: Exclude<NatalChartViewState, { status: "ready" }>;
}) {
  const title =
    state.status === "loading"
      ? "Preparing the chart"
      : state.status === "unavailable"
        ? "Chart houses are unavailable"
        : "The chart is unavailable";
  const message =
    state.status === "loading"
      ? "Validating chart facts and trace versions…"
      : state.message;
  return (
    <main
      className="status-shell"
      aria-live={state.status === "loading" ? "polite" : "assertive"}
    >
      <p className="eyebrow">My chart</p>
      <h1>{title}</h1>
      <p>{message}</p>
      <Link href="/">Return to Today</Link>
    </main>
  );
}
