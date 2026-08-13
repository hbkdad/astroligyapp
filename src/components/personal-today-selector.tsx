"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AccountShell } from "@/components/account-shell";
import { PersonalDashboard } from "@/components/personal-dashboard";
import {
  INITIAL_PERSONAL_TODAY_STATE,
  type PersonalTodayActionState,
  type PersonalTodayProfileOption,
} from "@/presentation/personal-today-state";

export type PersonalTodayAction = (
  previousState: PersonalTodayActionState,
  formData: FormData,
) => Promise<PersonalTodayActionState>;

export function PersonalTodaySelector({
  profiles,
  initialStatus,
  action,
}: {
  profiles: readonly PersonalTodayProfileOption[];
  initialStatus: "ready" | "authenticate" | "retry";
  action: PersonalTodayAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PERSONAL_TODAY_STATE,
  );
  if (state.status === "ready")
    return (
      <PersonalDashboard
        state={{ status: "ready", model: state.model }}
        badge="Private calculated data"
        chartHref="/account/profiles"
        timelineHref="#trace"
      />
    );

  return (
    <AccountShell
      eyebrow="Private daily context"
      title="Today from your saved chart"
      summary="Choose a private profile. The server authorizes it again and calculates current facts from a trusted instant."
    >
      {initialStatus === "authenticate" ? (
        <Status title="Sign in again">
          A recent verified session is required.{" "}
          <Link href="/account/sign-in">Return to sign in</Link>.
        </Status>
      ) : initialStatus === "retry" ? (
        <Status title="Profiles are temporarily unavailable">
          No private data was displayed. Try again later.
        </Status>
      ) : profiles.length === 0 ? (
        <Status title="No saved profile yet">
          <Link href="/account/profiles">Create a private birth profile</Link>,
          add a full birth name, and generate its natal chart first.
        </Status>
      ) : (
        <section
          className="account-panel"
          aria-labelledby="today-profile-heading"
        >
          <p className="section-kicker">Saved profiles</p>
          <h2 id="today-profile-heading">Choose whose Today to load</h2>
          <p>
            Profile identifiers are sent only in this authenticated POST and
            never placed in a public URL.
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
                <span>
                  {profile.birthNameReady
                    ? "Birth name ready"
                    : "Birth name needed"}
                </span>
                <button type="submit" disabled={pending}>
                  {pending
                    ? "Calculating…"
                    : `Load Today for ${profile.displayName}`}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
      {pending ? (
        <section className="account-panel account-status" role="status">
          <h2>Calculating Today</h2>
          <p>Validating the saved chart and current sky facts…</p>
        </section>
      ) : state.status !== "idle" ? (
        <section className="account-panel account-status" role="alert">
          <h2>{heading(state.status)}</h2>
          <p>
            {"message" in state ? state.message : "Calculating current facts…"}
          </p>
          {state.status === "stale" || state.status === "incomplete" ? (
            <Link href="/account/profiles">Review profile and natal chart</Link>
          ) : null}
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

function heading(
  status: Exclude<PersonalTodayActionState["status"], "idle" | "ready">,
) {
  return status === "loading"
    ? "Calculating Today"
    : status === "locked"
      ? "Today is locked"
      : status === "stale"
        ? "Natal chart needs regeneration"
        : status === "incomplete"
          ? "Profile setup is incomplete"
          : "Today is unavailable";
}
