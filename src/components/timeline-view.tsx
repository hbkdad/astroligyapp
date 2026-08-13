"use client";

import Link from "next/link";
import { useState } from "react";

import { HeaderUtilities } from "@/components/header-utilities";
import {
  type TimelineFilter,
  type TimelineState,
} from "@/presentation/timeline-read-model";

export function TimelineView({
  state,
  badge = "Local calculated demo",
}: {
  state: TimelineState;
  badge?: string;
}) {
  if (state.status !== "ready") return <TimelineStatus state={state} />;
  return <ReadyTimeline model={state.model} badge={badge} />;
}

function ReadyTimeline({
  model,
  badge,
}: {
  model: Extract<TimelineState, { status: "ready" }>["model"];
  badge: string;
}) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const visibleItems =
    filter === "all"
      ? model.items
      : model.items.filter((item) => item.filter === filter);
  const activeLabel = model.filters.find((item) => item.key === filter)!.label;
  return (
    <>
      <a className="skip-link" href="#timeline-content">
        Skip to timeline content
      </a>
      <header className="site-header timeline-header">
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
        <nav aria-label="Timeline navigation">
          <Link href="/">Today</Link>
          <Link href="/moon">Moon</Link>
          <Link href="/numerology">Numerology</Link>
          <a href="#events">Events</a>
          <a href="#event-table">Table</a>
          <a href="#timeline-trace">Trace</a>
        </nav>
        <HeaderUtilities badge={badge} />
      </header>

      <main id="timeline-content" className="timeline-shell" tabIndex={-1}>
        <header className="timeline-intro">
          <div>
            <p className="eyebrow">{model.eyebrow}</p>
            <h1>{model.title}</h1>
            <p className="hero-summary">{model.summary}</p>
          </div>
          <dl className="timeline-meta">
            <div>
              <dt>Display interval</dt>
              <dd>{model.intervalLabel}</dd>
            </div>
            <div>
              <dt>Source facts</dt>
              <dd>{model.items.length} deterministic events</dd>
            </div>
          </dl>
        </header>

        <section
          id="events"
          className="timeline-panel"
          aria-labelledby="events-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Chronological facts</p>
              <h2 id="events-heading">Event timeline</h2>
            </div>
            <span>{visibleItems.length} shown</span>
          </div>
          <div
            className="timeline-filters"
            role="group"
            aria-label="Filter timeline events"
          >
            {model.filters.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label} <span aria-hidden="true">{item.count}</span>
              </button>
            ))}
          </div>
          <p className="filter-status" aria-live="polite">
            Showing {visibleItems.length} of {model.items.length}: {activeLabel}
            .
          </p>
          {visibleItems.length ? (
            <ol className="event-timeline">
              {visibleItems.map((item) => (
                <li key={item.id} className={`timeline-${item.filter}`}>
                  <div className="event-marker" aria-hidden="true" />
                  <article>
                    <div className="event-heading">
                      <div>
                        <p className="event-category">{item.categoryLabel}</p>
                        <h3>{item.title}</h3>
                      </div>
                      <time dateTime={item.dateTime}>{item.dateLabel}</time>
                    </div>
                    <p>{item.detail}</p>
                    {item.traditionReflection ? (
                      <p className="interpretation-copy">
                        <strong>Tradition reflection:</strong>{" "}
                        {item.traditionReflection}
                      </p>
                    ) : (
                      <p className="occurrence-detail">
                        No deterministic interpretation is available for this
                        fact.
                      </p>
                    )}
                    <p className="occurrence-detail">{item.occurrenceLabel}</p>
                    <code>{item.sourceReference}</code>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-message">
              No events match this filter in the display interval.
            </p>
          )}
        </section>

        <section
          id="event-table"
          className="timeline-panel"
          aria-labelledby="event-table-heading"
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">Complete text equivalent</p>
              <h2 id="event-table-heading">Event table</h2>
            </div>
          </div>
          {visibleItems.length ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Filtered timeline event table"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Type</th>
                    <th scope="col">Event</th>
                    <th scope="col">Occurrence</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.dateLabel}</td>
                      <td>{item.categoryLabel}</td>
                      <th scope="row">{item.title}</th>
                      <td>{item.occurrenceLabel}</td>
                      <td>
                        <code>{item.sourceReference}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-message">The filtered event table is empty.</p>
          )}
        </section>

        <section
          id="timeline-trace"
          className="panel trace-panel timeline-trace"
          aria-labelledby="timeline-trace-heading"
        >
          <div>
            <p className="section-kicker">Reproducibility</p>
            <h2 id="timeline-trace-heading">Timeline trace</h2>
            <p>
              Presentation preserves the source versions and performs no event
              search, astrology, or numerology calculation.
            </p>
          </div>
          <details>
            <summary>View source versions</summary>
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
          Dates are calculated event facts, not predictions or medical, legal,
          financial, relationship, or safety advice.
        </p>
        <p>
          Timeline read model {model.version} · source {model.sourceVersion}
        </p>
      </footer>
    </>
  );
}

function TimelineStatus({
  state,
}: {
  state: Exclude<TimelineState, { status: "ready" }>;
}) {
  const message =
    state.status === "loading"
      ? "Preparing the deterministic event timeline…"
      : state.message;
  return (
    <main
      className="status-shell"
      aria-live={state.status === "loading" ? "polite" : "assertive"}
    >
      <p className="eyebrow">Personal event calendar</p>
      <h1>
        {state.status === "locked"
          ? "Your timeline is private"
          : state.status === "error"
            ? "The timeline is unavailable"
            : "Building your timeline"}
      </h1>
      <p>{message}</p>
      {state.status !== "loading" ? (
        <Link href="/">Return to Today</Link>
      ) : null}
    </main>
  );
}
