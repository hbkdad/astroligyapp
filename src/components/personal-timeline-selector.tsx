"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AccountShell } from "@/components/account-shell";
import { TimelineView } from "@/components/timeline-view";
import {
  INITIAL_PERSONAL_TIMELINE_STATE,
  type PersonalTimelineActionState,
  type PersonalTimelineProfileOption,
} from "@/presentation/personal-timeline-state";

export type PersonalTimelineAction = (
  previousState: PersonalTimelineActionState,
  formData: FormData,
) => Promise<PersonalTimelineActionState>;

export function PersonalTimelineSelector({
  profiles,
  initialStatus,
  action,
}: {
  profiles: readonly PersonalTimelineProfileOption[];
  initialStatus: "ready" | "authenticate" | "retry";
  action: PersonalTimelineAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PERSONAL_TIMELINE_STATE,
  );
  if (state.status === "ready")
    return (
      <>
        {state.truncated ? (
          <p className="account-notice" role="status">
            This result was bounded by the server plan or event limit.
          </p>
        ) : null}
        <TimelineView
          state={{ status: "ready", model: state.model }}
          badge={
            state.scope === "full-transit-calendar"
              ? "Private advanced calendar"
              : "Private 14-day forecast"
          }
        />
      </>
    );

  return (
    <AccountShell
      eyebrow="Private upcoming calendar"
      title="Your personal timeline"
      summary="Choose one saved chart. The server owns the UTC interval, entitlement scope, calculation versions, and event limits."
    >
      {initialStatus === "authenticate" ? (
        <Status title="Sign in again">
          <Link href="/account/sign-in">Return to sign in</Link> to continue.
        </Status>
      ) : initialStatus === "retry" ? (
        <Status title="Profiles are temporarily unavailable">
          No private data was displayed. Try again later.
        </Status>
      ) : profiles.length === 0 ? (
        <Status title="No saved chart yet">
          <Link href="/account/profiles">
            Create a profile and generate its natal chart
          </Link>{" "}
          first.
        </Status>
      ) : (
        <section
          className="account-panel"
          aria-labelledby="timeline-profile-heading"
        >
          <p className="section-kicker">Saved profiles</p>
          <h2 id="timeline-profile-heading">Choose whose timeline to load</h2>
          <p>
            Private identifiers remain inside this authenticated POST and never
            enter the URL.
          </p>
          <div className="profile-list">
            {profiles.map((profile) => (
              <form
                key={profile.profileId}
                action={formAction}
                aria-busy={pending}
              >
                <input type="hidden" name="version" value="1.0.0" />
                <input
                  type="hidden"
                  name="profileId"
                  value={profile.profileId}
                />
                <input
                  type="hidden"
                  name="birthProfileId"
                  value={profile.birthProfileId}
                />
                <input type="hidden" name="revision" value={profile.revision} />
                <strong>{profile.displayName}</strong>
                <span>Latest natal chart verified by the server</span>
                <button type="submit" disabled={pending}>
                  {pending
                    ? "Calculating…"
                    : `Load timeline for ${profile.displayName}`}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
      {pending ? (
        <section className="account-panel account-status" role="status">
          <h2>Calculating timeline</h2>
          <p>Observing and refining bounded upcoming events…</p>
        </section>
      ) : state.status !== "idle" ? (
        <section className="account-panel account-status" role="alert">
          <h2>Timeline unavailable</h2>
          <p>{"message" in state ? state.message : "Try again."}</p>
        </section>
      ) : null}
    </AccountShell>
  );
}

function Status({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="account-panel account-status" role="status">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
