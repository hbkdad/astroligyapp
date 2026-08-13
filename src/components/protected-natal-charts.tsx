"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, type RefObject } from "react";

import {
  INITIAL_PROTECTED_NATAL_CHART_ACTION_STATE,
  type ProtectedNatalChartActionState,
  type ProtectedNatalChartProfileView,
} from "@/presentation/protected-natal-chart-state";

export type ProtectedNatalChartAction = (
  previous: ProtectedNatalChartActionState,
  formData: FormData,
) => Promise<ProtectedNatalChartActionState>;

export function ProtectedNatalCharts({
  profiles,
  action,
}: {
  profiles: readonly ProtectedNatalChartProfileView[];
  action: ProtectedNatalChartAction;
}) {
  return (
    <section
      className="account-panel protected-charts"
      aria-labelledby="protected-chart-heading"
    >
      <p className="section-kicker">Deterministic chart</p>
      <h2 id="protected-chart-heading">Saved natal charts</h2>
      <p>
        Charts use the saved local time, IANA timezone, and coordinates. Unknown
        or ambiguous inputs are never guessed.
      </p>
      {profiles.length === 0 ? (
        <p>Save a private profile before generating a chart.</p>
      ) : (
        <div className="protected-chart-list">
          {profiles.map((profile) => (
            <ProtectedChart
              key={profile.birthProfileId}
              profile={profile}
              action={action}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProtectedChart({
  profile,
  action,
}: {
  profile: ProtectedNatalChartProfileView;
  action: ProtectedNatalChartAction;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROTECTED_NATAL_CHART_ACTION_STATE,
  );
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.disposition === "idle") return;
    feedback.current?.focus();
    if (state.disposition === "generated" || state.disposition === "cached")
      router.refresh();
  }, [router, state]);
  return (
    <article className="protected-chart-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Private profile</p>
          <h3>{profile.displayName}</h3>
        </div>
        <span>
          {profile.timePrecision === "approximate"
            ? "Approximate birth time"
            : "Exact birth time required"}
        </span>
      </div>
      {profile.chartStale ? (
        <p className="profile-limit" role="status">
          The saved details changed after this chart was calculated. Regenerate
          it before relying on the chart facts.
        </p>
      ) : null}
      {!profile.generationAllowed ? (
        <p className="profile-limit" role="status">
          Natal chart generation is locked on the current plan. Existing
          verified charts remain readable.
        </p>
      ) : profile.readiness === "ready" ? (
        <form action={formAction} aria-busy={pending}>
          <input type="hidden" name="version" value="1.0.0" />
          <input type="hidden" name="profileId" value={profile.profileId} />
          <input
            type="hidden"
            name="birthProfileId"
            value={profile.birthProfileId}
          />
          <input type="hidden" name="revision" value={profile.revision} />
          <button type="submit" disabled={pending}>
            {pending
              ? "Calculating chart…"
              : profile.chart || profile.chartStale
                ? "Regenerate verified chart"
                : "Generate verified chart"}
          </button>
        </form>
      ) : (
        <ReadinessMessage readiness={profile.readiness} />
      )}
      <ChartFeedback state={state} reference={feedback} />
      {profile.chart ? <ChartFacts profile={profile} /> : null}
    </article>
  );
}

function ReadinessMessage({
  readiness,
}: {
  readiness: ProtectedNatalChartProfileView["readiness"];
}) {
  const messages = {
    ready: "Ready.",
    "date-only":
      "Add an approximate or exact local birth time before generating a chart.",
    "coordinates-missing":
      "Add both birth latitude and longitude before generating a chart.",
    "ambiguous-time":
      "This local time occurs twice because of a clock change. It must be resolved before a chart can be generated.",
    "nonexistent-time":
      "This local time did not occur because of a clock change. Correct the saved time before generating a chart.",
  };
  return (
    <p className="profile-limit" role="status">
      {messages[readiness]}
    </p>
  );
}

function ChartFacts({ profile }: { profile: ProtectedNatalChartProfileView }) {
  const chart = profile.chart!;
  return (
    <details className="protected-chart-facts">
      <summary>Read chart facts and provenance</summary>
      <p>{chart.subtitle}</p>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${profile.displayName} natal placements`}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Body</th>
              <th scope="col">Position</th>
              <th scope="col">House</th>
            </tr>
          </thead>
          <tbody>
            {chart.placements.map((placement) => (
              <tr key={placement.body}>
                <th scope="row">{placement.bodyLabel}</th>
                <td>{placement.degreeLabel}</td>
                <td>{placement.houseNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        {chart.aspects.length} configured major aspects. Orb strength is a
        product-defined heuristic, not scientific measurement.
      </p>
      <dl className="profile-summary">
        {chart.trace.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function ChartFeedback({
  state,
  reference,
}: {
  state: ProtectedNatalChartActionState;
  reference: RefObject<HTMLDivElement | null>;
}) {
  if (state.disposition === "idle") return null;
  const messages: Record<
    Exclude<ProtectedNatalChartActionState["disposition"], "idle">,
    string
  > = {
    generated: "Chart generated from the saved private profile.",
    cached: "The existing verified chart is current.",
    authenticate: "Sign in again with a recent verified session.",
    authorize: "The selected profile could not be authorized.",
    locked: "Natal charts are not included in the current plan.",
    conflict: "The profile changed. Reload before generating the chart.",
    "date-only": "A local birth time is required.",
    "coordinates-missing": "Both birth coordinates are required.",
    "ambiguous-time": "The saved local time occurs twice and was not guessed.",
    "nonexistent-time":
      "The saved local time does not exist and was not adjusted.",
    unavailable:
      "The deterministic calculation provider could not produce a chart.",
    retry:
      "Chart generation is temporarily unavailable; no result was confirmed.",
  };
  const success =
    state.disposition === "generated" || state.disposition === "cached";
  return (
    <div
      ref={reference}
      className={`profile-feedback ${state.disposition}`}
      role={success ? "status" : "alert"}
      tabIndex={-1}
    >
      {messages[state.disposition]}
    </div>
  );
}
