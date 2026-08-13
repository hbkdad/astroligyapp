"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  INITIAL_PRIVATE_PROFILE_ACTION_STATE,
  type PrivateProfileActionState,
  type PrivateProfilePrecision,
  type PrivateProfileView,
} from "@/presentation/private-profile-state";

export type PrivateProfileAction = (
  previousState: PrivateProfileActionState,
  formData: FormData,
) => Promise<PrivateProfileActionState>;

export function PrivateProfiles({
  profiles,
  multipleProfilesAllowed,
  action,
}: {
  profiles: readonly PrivateProfileView[];
  multipleProfilesAllowed: boolean;
  action: PrivateProfileAction;
}) {
  const canCreate = profiles.length === 0 || multipleProfilesAllowed;
  return (
    <div className="private-profiles">
      <section
        className="account-panel"
        aria-labelledby="saved-profiles-heading"
      >
        <p className="section-kicker">Private records</p>
        <h2 id="saved-profiles-heading">Your saved profiles</h2>
        <p className="profile-privacy-note">
          Birth dates, times, locations, and names stay on this authenticated
          page. They are never placed in public links or used as analytics data.
        </p>
        {profiles.length === 0 ? (
          <p className="profile-empty">No private profiles are saved yet.</p>
        ) : (
          <div className="profile-list">
            {profiles.map((profile) => (
              <SavedProfile
                key={profile.birthProfileId}
                profile={profile}
                action={action}
              />
            ))}
          </div>
        )}
      </section>
      <section
        className="account-panel"
        aria-labelledby="create-profile-heading"
      >
        <p className="section-kicker">New profile</p>
        <h2 id="create-profile-heading">Save birth details</h2>
        {canCreate ? (
          <ProfileMutationForm operation="create" action={action} />
        ) : (
          <div className="profile-limit" role="status">
            <strong>One-profile limit reached</strong>
            <p>
              Your current entitlement supports one saved profile. Existing
              profile editing and deletion remain available.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function SavedProfile({
  profile,
  action,
}: {
  profile: PrivateProfileView;
  action: PrivateProfileAction;
}) {
  return (
    <article className="saved-profile">
      <h3>{profile.displayName}</h3>
      <dl className="profile-summary">
        <div>
          <dt>Birth date</dt>
          <dd>{profile.birthDate}</dd>
        </div>
        <div>
          <dt>Full birth name</dt>
          <dd>{profile.birthName ?? "Not provided"}</dd>
        </div>
        <div>
          <dt>Birth time</dt>
          <dd>
            {profile.birthTimeLocal ?? "Not provided"} ·{" "}
            {profile.birthTimePrecision}
          </dd>
        </div>
        <div>
          <dt>Birth timezone</dt>
          <dd>{profile.birthTimezone}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>
            {profile.latitude === null
              ? "Not provided"
              : `${profile.latitude.toFixed(6)}, ${profile.longitude!.toFixed(6)}`}
          </dd>
        </div>
      </dl>
      <details>
        <summary>Edit private details</summary>
        <ProfileMutationForm
          operation="update"
          profile={profile}
          action={action}
        />
      </details>
      <ProfileDeleteForm profile={profile} action={action} />
    </article>
  );
}

function ProfileMutationForm({
  operation,
  profile,
  action,
}: {
  operation: "create" | "update";
  profile?: PrivateProfileView;
  action: PrivateProfileAction;
}) {
  const prefix = useId();
  const router = useRouter();
  const [precision, setPrecision] = useState<PrivateProfilePrecision>(
    profile?.birthTimePrecision ?? "date-only",
  );
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PRIVATE_PROFILE_ACTION_STATE,
  );
  const feedbackReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "idle") return;
    feedbackReference.current?.focus();
    if (state.status === "saved") router.refresh();
  }, [operation, router, state]);

  return (
    <form action={formAction} className="profile-form" aria-busy={pending}>
      <input type="hidden" name="version" value="1.1.0" />
      <input type="hidden" name="operation" value={operation} />
      {profile ? (
        <>
          <input type="hidden" name="profileId" value={profile.profileId} />
          <input
            type="hidden"
            name="birthProfileId"
            value={profile.birthProfileId}
          />
          <input type="hidden" name="revision" value={profile.revision} />
        </>
      ) : null}
      <Field label="Display name" id={`${prefix}-name`}>
        <input
          id={`${prefix}-name`}
          name="displayName"
          type="text"
          autoComplete="name"
          minLength={1}
          maxLength={80}
          defaultValue={profile?.displayName}
          required
        />
      </Field>
      <Field
        label="Full birth name (optional)"
        id={`${prefix}-birth-name`}
        hint="Required for complete numerology. Use the full name recorded at birth; it stays private."
      >
        <input
          id={`${prefix}-birth-name`}
          name="birthName"
          type="text"
          autoComplete="off"
          aria-describedby={`${prefix}-birth-name-hint`}
          maxLength={160}
          defaultValue={profile?.birthName ?? ""}
        />
      </Field>
      <Field
        label="Current timezone"
        id={`${prefix}-current-timezone`}
        hint="Example: America/Toronto"
      >
        <input
          id={`${prefix}-current-timezone`}
          name="currentTimezone"
          type="text"
          autoComplete="off"
          aria-describedby={`${prefix}-current-timezone-hint`}
          maxLength={128}
          defaultValue={profile?.currentTimezone ?? "America/Toronto"}
          required
        />
      </Field>
      <Field label="Birth date" id={`${prefix}-birth-date`}>
        <input
          id={`${prefix}-birth-date`}
          name="birthDate"
          type="date"
          min="1800-01-01"
          defaultValue={profile?.birthDate}
          required
        />
      </Field>
      <Field
        label="Birth-time precision"
        id={`${prefix}-precision`}
        hint="Choose date-only when the time is unknown. Approximate times remain labeled as uncertain."
      >
        <select
          id={`${prefix}-precision`}
          name="birthTimePrecision"
          aria-describedby={`${prefix}-precision-hint`}
          value={precision}
          onChange={(event) =>
            setPrecision(event.target.value as PrivateProfilePrecision)
          }
        >
          <option value="date-only">Date only — time unknown</option>
          <option value="approximate">Approximate local time</option>
          <option value="exact">Exact local time</option>
        </select>
      </Field>
      <Field
        label="Local birth time"
        id={`${prefix}-birth-time`}
        hint="Required only for approximate or exact time."
      >
        <input
          id={`${prefix}-birth-time`}
          name="birthTimeLocal"
          aria-describedby={`${prefix}-birth-time-hint`}
          type="time"
          step={60}
          defaultValue={profile?.birthTimeLocal ?? ""}
          disabled={precision === "date-only"}
          required={precision !== "date-only"}
        />
        {precision === "date-only" ? (
          <input type="hidden" name="birthTimeLocal" value="" />
        ) : null}
      </Field>
      <Field
        label="Birth timezone"
        id={`${prefix}-birth-timezone`}
        hint="Use the IANA timezone at the birthplace, such as America/Toronto."
      >
        <input
          id={`${prefix}-birth-timezone`}
          name="birthTimezone"
          type="text"
          autoComplete="off"
          aria-describedby={`${prefix}-birth-timezone-hint`}
          maxLength={128}
          defaultValue={profile?.birthTimezone ?? "America/Toronto"}
          required
        />
      </Field>
      <fieldset className="coordinate-fields">
        <legend>Birth coordinates (optional)</legend>
        <p>
          Enter both values only when you know them. No location is inferred or
          geocoded.
        </p>
        <Field
          label="Latitude"
          id={`${prefix}-latitude`}
          hint="−90 to 90, up to 6 decimals"
        >
          <input
            id={`${prefix}-latitude`}
            name="latitude"
            type="number"
            inputMode="decimal"
            aria-describedby={`${prefix}-latitude-hint`}
            min={-90}
            max={90}
            step="0.000001"
            defaultValue={profile?.latitude ?? ""}
          />
        </Field>
        <Field
          label="Longitude"
          id={`${prefix}-longitude`}
          hint="−180 to 180, up to 6 decimals"
        >
          <input
            id={`${prefix}-longitude`}
            name="longitude"
            type="number"
            inputMode="decimal"
            aria-describedby={`${prefix}-longitude-hint`}
            min={-180}
            max={180}
            step="0.000001"
            defaultValue={profile?.longitude ?? ""}
          />
        </Field>
      </fieldset>
      <ProfileFeedback state={state} reference={feedbackReference} />
      <button type="submit" disabled={pending}>
        {pending
          ? "Saving profile…"
          : operation === "create"
            ? "Save private profile"
            : "Save profile changes"}
      </button>
    </form>
  );
}

function ProfileDeleteForm({
  profile,
  action,
}: {
  profile: PrivateProfileView;
  action: PrivateProfileAction;
}) {
  const prefix = useId();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PRIVATE_PROFILE_ACTION_STATE,
  );
  const feedbackReference = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "idle") return;
    feedbackReference.current?.focus();
    if (state.status === "deleted") router.refresh();
  }, [router, state]);
  return (
    <details className="profile-delete">
      <summary>Delete this profile</summary>
      <p>
        This removes its private birth data, derived records, and public shares.
        Type DELETE PROFILE to confirm.
      </p>
      <form action={formAction} aria-busy={pending}>
        <input type="hidden" name="version" value="1.1.0" />
        <input type="hidden" name="operation" value="delete" />
        <input type="hidden" name="profileId" value={profile.profileId} />
        <input
          type="hidden"
          name="birthProfileId"
          value={profile.birthProfileId}
        />
        <input type="hidden" name="revision" value={profile.revision} />
        <Field label="Type DELETE PROFILE" id={`${prefix}-confirmation`}>
          <input
            id={`${prefix}-confirmation`}
            name="confirmation"
            type="text"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </Field>
        <ProfileFeedback state={state} reference={feedbackReference} />
        <button type="submit" disabled={pending}>
          {pending ? "Deleting profile…" : "Permanently delete profile"}
        </button>
      </form>
    </details>
  );
}

function ProfileFeedback({
  state,
  reference,
}: {
  state: PrivateProfileActionState;
  reference: RefObject<HTMLDivElement | null>;
}) {
  if (state.status === "idle") return null;
  const messages: Record<
    Exclude<PrivateProfileActionState["status"], "idle">,
    string
  > = {
    saved: "Private profile saved.",
    deleted: "Private profile deleted.",
    authenticate: "Sign in again with a recent verified session.",
    authorize: "Check every field. No private profile was changed.",
    limit: "Your current entitlement does not allow another saved profile.",
    conflict:
      "This profile changed in another session. Reload before trying again.",
    retry:
      "The profile operation is temporarily unavailable. No result was confirmed.",
  };
  return (
    <div
      ref={reference}
      className={`profile-feedback ${state.status}`}
      role={
        state.status === "saved" || state.status === "deleted"
          ? "status"
          : "alert"
      }
      tabIndex={-1}
    >
      {messages[state.status]}
    </div>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="profile-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      ) : null}
    </div>
  );
}
