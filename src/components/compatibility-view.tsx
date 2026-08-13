import Link from "next/link";
import { HeaderUtilities } from "@/components/header-utilities";
import type { CompatibilityViewState } from "@/presentation/compatibility-read-model";

export function CompatibilityView({
  state,
}: {
  state: CompatibilityViewState;
}) {
  if (state.status !== "ready") return <CompatibilityStatus state={state} />;
  const { model } = state;
  return (
    <>
      <a className="skip-link" href="#compatibility-content">
        Skip to compatibility content
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
        <nav aria-label="Compatibility navigation">
          <Link href="/">Today</Link>
          <a href="#category-scores">Scores</a>
          <a href="#comparison-factors">Factors</a>
          <a href="#compatibility-trace">Trace</a>
        </nav>
        <HeaderUtilities badge="Private local demo" />
      </header>
      <main
        id="compatibility-content"
        className="compatibility-shell"
        tabIndex={-1}
      >
        <header className="compatibility-intro">
          <p className="eyebrow">{model.eyebrow}</p>
          <h1>{model.title}</h1>
          <p className="hero-summary">{model.summary}</p>
          <p className="compatibility-disclaimer">{model.disclaimer}</p>
        </header>
        <section
          id="category-scores"
          className="compatibility-panel"
          aria-labelledby="compatibility-scores-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Product-defined heuristics</p>
              <h2 id="compatibility-scores-heading">Category scores</h2>
            </div>
            <span>5 transparent categories</span>
          </div>
          <ul className="compatibility-score-grid">
            {model.categories.map((category) => (
              <li key={category.id}>
                <div>
                  <h3>{category.label}</h3>
                  <strong>{category.score}</strong>
                </div>
                <meter
                  min={0}
                  max={100}
                  value={category.score}
                  aria-label={`${category.label}: ${category.scoreText}`}
                />
                <p>
                  {category.scoreText} · {category.confidenceText} ·{" "}
                  {category.factorCountText}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section
          id="comparison-factors"
          className="compatibility-panel"
          aria-labelledby="compatibility-factors-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Explainable contributions</p>
              <h2 id="compatibility-factors-heading">
                Calculated facts and reflections
              </h2>
            </div>
            <span>{model.items.length} matched factors</span>
          </div>
          <ol className="compatibility-factor-list">
            {model.items.map((item) => (
              <li key={item.id}>
                <header>
                  <div>
                    <p>{item.categoryLabel}</p>
                    <h3>{item.toneLabel} factor</h3>
                  </div>
                  <strong>{item.impactText}</strong>
                </header>
                <div className="compatibility-copy-grid">
                  <section aria-label="Calculated fact">
                    <p className="section-kicker">Calculated fact</p>
                    <p>{item.factText}</p>
                    {item.factStatus === "unsupported" ? (
                      <small>Deterministic fallback</small>
                    ) : null}
                  </section>
                  <section
                    className="compatibility-reflection"
                    aria-label="Tradition-framed reflection"
                  >
                    <p className="section-kicker">
                      Tradition-framed reflection
                    </p>
                    <p>{item.reflectionText}</p>
                    {item.reflectionStatus === "unsupported" ? (
                      <small>Deterministic fallback</small>
                    ) : null}
                  </section>
                </div>
                <code>{item.sourceFactId}</code>
              </li>
            ))}
          </ol>
        </section>
        <section
          id="compatibility-trace"
          className="panel trace-panel compatibility-trace"
          aria-labelledby="compatibility-trace-heading"
        >
          <div>
            <p className="section-kicker">Reproducibility</p>
            <h2 id="compatibility-trace-heading">Report source trace</h2>
            <p>
              Every displayed score and section retains its calculation, policy,
              content, and renderer versions.
            </p>
          </div>
          <details>
            <summary>View report versions</summary>
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
          Compatibility scores are non-scientific product heuristics, not
          relationship predictions or advice.
        </p>
        <p>Compatibility read model {model.version}</p>
      </footer>
    </>
  );
}

function CompatibilityStatus({
  state,
}: {
  state: Exclude<CompatibilityViewState, { status: "ready" }>;
}) {
  const title =
    state.status === "loading"
      ? "Preparing the comparison"
      : state.status === "locked"
        ? "This comparison is private"
        : state.status === "empty"
          ? "No comparison factors are available"
          : state.status === "unsupported"
            ? "Some compatibility content is unsupported"
            : state.status === "unavailable"
              ? "Compatibility data is unavailable"
              : "The compatibility view is unavailable";
  return (
    <main
      className="status-shell"
      aria-live={state.status === "loading" ? "polite" : "assertive"}
    >
      <p className="eyebrow">Compatibility</p>
      <h1>{title}</h1>
      <p>
        {state.status === "loading"
          ? "Validating relationship facts and transparent category traces…"
          : state.message}
      </p>
      {state.status !== "loading" ? (
        <Link href="/">Return to Today</Link>
      ) : null}
    </main>
  );
}
