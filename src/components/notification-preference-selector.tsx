"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { AccountShell } from "@/components/account-shell";
import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
} from "@/application/materialize-notification-candidates";
import {
  INITIAL_NOTIFICATION_PREFERENCE_STATE,
  type NotificationPreferenceActionState,
  type NotificationProfileOption,
} from "@/presentation/notification-preference-state";
import type { NotificationPreferenceView } from "@/infrastructure/persistence/notification-preference-repository";

export type NotificationPreferenceAction = (
  previousState: NotificationPreferenceActionState,
  formData: FormData,
) => Promise<NotificationPreferenceActionState>;

export function NotificationPreferenceSelector({
  profiles,
  initialStatus,
  loadAction,
  replaceAction,
}: {
  profiles: readonly NotificationProfileOption[];
  initialStatus: "ready" | "authenticate" | "retry";
  loadAction: NotificationPreferenceAction;
  replaceAction: NotificationPreferenceAction;
}) {
  const [state, action, pending] = useActionState(
    loadAction,
    INITIAL_NOTIFICATION_PREFERENCE_STATE,
  );
  if (state.status === "ready")
    return <NotificationSettings initial={state.view} action={replaceAction} />;
  return (
    <AccountShell
      eyebrow="Private alert controls"
      title="Event notification preferences"
      summary="Choose a saved profile. Ownership, natal timezone, plan, chart, timeline facts, and delivery contact remain server-owned."
    >
      {initialStatus === "authenticate" ? (
        <Status title="Sign in again">
          <Link href="/account/sign-in">Return to sign in</Link> to continue.
        </Status>
      ) : initialStatus === "retry" ? (
        <Status title="Profiles are temporarily unavailable">
          No private alert settings were displayed.
        </Status>
      ) : profiles.length === 0 ? (
        <Status title="No saved profile yet">
          <Link href="/account/profiles">Create a private profile</Link> first.
        </Status>
      ) : (
        <section
          className="account-panel"
          aria-labelledby="alert-profile-heading"
        >
          <p className="section-kicker">Saved profiles</p>
          <h2 id="alert-profile-heading">Choose whose alerts to manage</h2>
          <p>
            Opaque identifiers stay inside this authenticated POST and never
            enter the URL.
          </p>
          <div className="profile-list">
            {profiles.map((profile) => (
              <form key={profile.profileId} action={action} aria-busy={pending}>
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
                <input
                  type="hidden"
                  name="profileRevision"
                  value={profile.profileRevision}
                />
                <strong>{profile.displayName}</strong>
                <span>Plan and alert access verified by the server</span>
                <button type="submit" disabled={pending}>
                  {pending
                    ? "Loading…"
                    : `Manage alerts for ${profile.displayName}`}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
      {state.status !== "idle" ? <ActionStatus state={state} /> : null}
    </AccountShell>
  );
}

function NotificationSettings({
  initial,
  action,
}: {
  initial: NotificationPreferenceView;
  action: NotificationPreferenceAction;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "ready",
    view: initial,
    materialization: null,
  } as const satisfies NotificationPreferenceActionState);
  const view = state.status === "ready" ? state.view : initial;
  const [consent, setConsent] = useState(initial.consent);
  const [eventTypes, setEventTypes] = useState<
    readonly NotificationEventType[]
  >(initial.eventTypes);
  const [leadMinutes, setLeadMinutes] = useState(initial.leadMinutes);
  const [quietEnabled, setQuietEnabled] = useState(initial.quietHours !== null);
  const [quietStart, setQuietStart] = useState(
    initial.quietHours?.start ?? "22:00",
  );
  const [quietEnd, setQuietEnd] = useState(initial.quietHours?.end ?? "07:00");

  function toggleEvent(eventType: NotificationEventType, checked: boolean) {
    setEventTypes((current) =>
      NOTIFICATION_EVENT_TYPES.filter((item) =>
        item === eventType ? checked : current.includes(item),
      ),
    );
  }

  return (
    <AccountShell
      eyebrow="Private alert controls"
      title={`Alerts for ${view.displayName}`}
      summary="Preferences can be saved and deterministic candidates can be prepared. No email is sent because a general notification delivery provider has not been selected."
    >
      <section
        className="account-panel"
        aria-labelledby="delivery-state-heading"
      >
        <p className="section-kicker">Delivery boundary</p>
        <h2 id="delivery-state-heading">Email delivery is unavailable</h2>
        <p>
          The verified account email remains server-owned. Candidates stay in a
          private
          <code> pending-provider </code> state until a delivery provider,
          consent audit, suppression, and release procedure are approved.
        </p>
      </section>
      <form
        className="account-panel account-form"
        action={formAction}
        aria-busy={pending}
      >
        <input type="hidden" name="version" value="1.0.0" />
        <input type="hidden" name="operation" value="replace" />
        <input type="hidden" name="profileId" value={view.profileId} />
        <input
          type="hidden"
          name="birthProfileId"
          value={view.birthProfileId}
        />
        <input
          type="hidden"
          name="profileRevision"
          value={view.profileRevision}
        />
        <input
          type="hidden"
          name="preferenceRevision"
          value={view.preferenceRevision}
        />
        <input type="hidden" name="channel" value="email" />
        <input type="hidden" name="consent" value={String(consent)} />
        <input
          type="hidden"
          name="eventTypes"
          value={JSON.stringify(consent ? eventTypes : [])}
        />
        <input type="hidden" name="leadMinutes" value={String(leadMinutes)} />
        <input
          type="hidden"
          name="quietHours"
          value={JSON.stringify(
            quietEnabled ? { start: quietStart, end: quietEnd } : null,
          )}
        />
        <fieldset>
          <legend>Consent</legend>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => {
                setConsent(event.target.checked);
                if (!event.target.checked) setEventTypes([]);
              }}
            />
            Prepare email alert candidates for the selected event families
          </label>
        </fieldset>
        <fieldset disabled={!consent}>
          <legend>Event families</legend>
          {NOTIFICATION_EVENT_TYPES.map((eventType) => (
            <label key={eventType}>
              <input
                type="checkbox"
                checked={eventTypes.includes(eventType)}
                onChange={(event) =>
                  toggleEvent(eventType, event.target.checked)
                }
              />
              {EVENT_LABELS[eventType]}
            </label>
          ))}
        </fieldset>
        <label>
          Lead time
          <select
            value={leadMinutes}
            onChange={(event) =>
              setLeadMinutes(
                Number(event.target.value) as typeof initial.leadMinutes,
              )
            }
            aria-describedby="lead-time-note"
          >
            <option value="0">At the event</option>
            <option value="60">1 hour before</option>
            <option value="360">6 hours before</option>
            <option value="1440">1 day before</option>
          </select>
        </label>
        <p id="lead-time-note">
          Candidates delayed by quiet hours are skipped if the event would
          already have occurred.
        </p>
        <fieldset>
          <legend>Quiet hours in {view.timezone.replaceAll("_", " ")}</legend>
          <label>
            <input
              type="checkbox"
              checked={quietEnabled}
              onChange={(event) => setQuietEnabled(event.target.checked)}
            />
            Delay candidates until quiet hours end
          </label>
          <label>
            Start
            <input
              type="time"
              value={quietStart}
              disabled={!quietEnabled}
              onChange={(event) => setQuietStart(event.target.value)}
            />
          </label>
          <label>
            End
            <input
              type="time"
              value={quietEnd}
              disabled={!quietEnabled}
              onChange={(event) => setQuietEnd(event.target.value)}
            />
          </label>
        </fieldset>
        <button
          type="submit"
          disabled={
            pending ||
            (consent && eventTypes.length === 0) ||
            (quietEnabled &&
              (!quietStart || !quietEnd || quietStart === quietEnd))
          }
        >
          {pending
            ? "Saving…"
            : consent
              ? "Save and prepare candidates"
              : "Withdraw alert consent"}
        </button>
      </form>
      {state.status === "ready" && state.materialization ? (
        <section className="account-panel account-status" role="status">
          <h2>Preferences saved</h2>
          <p>
            {state.materialization.status === "prepared"
              ? `${state.materialization.inserted} new candidates prepared; ${state.materialization.existing} already existed; ${state.materialization.invalidated} stale candidates invalidated.`
              : "Preferences were saved, but current validated timeline facts were unavailable."}
          </p>
          <p>No candidate was sent.</p>
        </section>
      ) : state.status !== "ready" && state.status !== "idle" ? (
        <ActionStatus state={state} />
      ) : null}
      <DeliveryHistory deliveries={view.deliveries} />
    </AccountShell>
  );
}

function DeliveryHistory({
  deliveries,
}: {
  deliveries: NotificationPreferenceView["deliveries"];
}) {
  return (
    <section
      className="account-panel"
      aria-labelledby="delivery-history-heading"
    >
      <p className="section-kicker">Private history</p>
      <h2 id="delivery-history-heading">Prepared candidates</h2>
      {deliveries.length === 0 ? (
        <p>No notification candidate has been prepared for this profile.</p>
      ) : (
        <div
          className="table-scroll"
          role="region"
          aria-label="Notification candidate history"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Occurs</th>
                <th scope="col">Scheduled</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery, index) => (
                <tr
                  key={`${delivery.eventType}:${delivery.scheduledAt}:${index}`}
                >
                  <th scope="row">{EVENT_LABELS[delivery.eventType]}</th>
                  <td>
                    <time dateTime={delivery.eventOccursAt}>
                      {formatInstant(delivery.eventOccursAt)}
                    </time>
                  </td>
                  <td>
                    <time dateTime={delivery.scheduledAt}>
                      {formatInstant(delivery.scheduledAt)}
                    </time>
                  </td>
                  <td>{delivery.status.replaceAll("-", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ActionStatus({
  state,
}: {
  state: Exclude<NotificationPreferenceActionState, { status: "ready" }>;
}) {
  const ref = useRef<HTMLElement>(null);
  const isError = "message" in state;
  useEffect(() => {
    if (isError) ref.current?.focus();
  }, [isError, state]);
  return (
    <section
      ref={ref}
      className="account-panel account-status"
      role={isError ? "alert" : "status"}
      tabIndex={isError ? -1 : undefined}
    >
      <h2>Alert settings unavailable</h2>
      <p>
        {"message" in state ? state.message : "Loading private alert settings…"}
      </p>
    </section>
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

function formatInstant(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

const EVENT_LABELS: Record<NotificationEventType, string> = {
  "personal-transit": "Personal transit peaks",
  "primary-phase": "Primary Moon phases",
  "moon-sign-ingress": "Moon sign changes",
  "planetary-station": "Planetary stations",
  "personal-year-boundary": "Personal year boundaries",
  "personal-month-boundary": "Personal month boundaries",
  "personal-day-boundary": "Personal day boundaries",
};
