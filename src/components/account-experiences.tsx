"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  INITIAL_ACCOUNT_ACTIVATION_STATE,
  type AccountActivationState,
} from "@/presentation/account-activation-state";
import {
  AUTH_SESSION_CHANGED_EVENT,
  getAuthSession,
  postAuthMutation,
  signOut,
  type AuthMutationResult,
  type AuthSessionResult,
} from "@/presentation/auth-http-client";

type Feedback = Readonly<{
  tone: "error" | "success";
  message: string;
}> | null;

export type AccountActivationAction = (
  previousState: AccountActivationState,
  formData: FormData,
) => Promise<AccountActivationState>;

export function AccountOverview({
  activationAction,
}: {
  activationAction: AccountActivationAction;
}) {
  const [state, setState] = useState<
    AuthSessionResult | Readonly<{ status: "checking" }>
  >({
    status: "checking",
  });
  const [signingOut, setSigningOut] = useState(false);

  function refresh() {
    setState({ status: "checking" });
    void getAuthSession().then(setState);
  }

  useEffect(() => {
    void getAuthSession().then(setState);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    const result = await signOut();
    setSigningOut(false);
    if (result.status === "accepted") {
      setState({ status: "anonymous" });
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
      return;
    }
    setState({
      status: result.status === "rate-limited" ? "rate-limited" : "unavailable",
    });
  }

  if (state.status === "checking")
    return (
      <section className="account-panel account-status" aria-live="polite">
        Checking your session…
      </section>
    );

  if (state.status === "authenticated") {
    return (
      <section
        className="account-panel"
        aria-labelledby="account-session-heading"
      >
        <p className="section-kicker">Signed in</p>
        <h2 id="account-session-heading">Welcome, {state.user.name}</h2>
        <dl className="account-details">
          <div>
            <dt>Email</dt>
            <dd>{state.user.email}</dd>
          </div>
          <div>
            <dt>Email status</dt>
            <dd>
              {state.user.emailVerified ? "Verified" : "Verification needed"}
            </dd>
          </div>
        </dl>
        <div className="account-actions">
          {!state.user.emailVerified ? (
            <Link href="/account/verify-email">Verify email</Link>
          ) : null}
          <button type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
        {state.user.emailVerified ? (
          <AccountActivation action={activationAction} />
        ) : null}
        <p className="account-boundary-note">
          This status is for presentation only. Every private read and change is
          authorized again on the server.
        </p>
      </section>
    );
  }

  if (state.status === "anonymous") {
    return (
      <section className="account-panel" aria-labelledby="signed-out-heading">
        <p className="section-kicker">Signed out</p>
        <h2 id="signed-out-heading">Choose how to continue</h2>
        <p>
          Sign in to an existing account or create one with email and a
          password.
        </p>
        <div className="account-actions">
          <Link href="/account/sign-in">Sign in</Link>
          <Link href="/account/sign-up">Create account</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="account-panel account-status" role="alert">
      <h2>Session status is temporarily unavailable</h2>
      <p>No account decision was made. Try the check again.</p>
      <button type="button" onClick={refresh}>
        Retry session check
      </button>
    </section>
  );
}

export function AccountActivation({
  action,
}: {
  action: AccountActivationAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ACCOUNT_ACTIVATION_STATE,
  );
  const statusReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      state.status === "authenticate" ||
      state.status === "retry" ||
      state.status === "reconcile"
    )
      statusReference.current?.focus();
  }, [state]);

  return (
    <section
      className="account-activation"
      aria-labelledby="account-activation-heading"
    >
      <p className="section-kicker">Private workspace</p>
      <h3 id="account-activation-heading">Account readiness</h3>
      {pending ? (
        <p role="status">Checking your verified account…</p>
      ) : state.status === "ready" ? (
        <div
          ref={statusReference}
          className="account-activation-status ready"
          role="status"
        >
          <strong>Private account ready</strong>
          <p>Your server-verified account boundary is active.</p>
        </div>
      ) : state.status === "authenticate" ? (
        <div
          ref={statusReference}
          className="account-activation-status"
          role="alert"
          tabIndex={-1}
        >
          <strong>Verification is required</strong>
          <p>
            Sign in again and verify your email before activating private
            account features.
          </p>
          <Link href="/account/sign-in">Return to sign in</Link>
        </div>
      ) : state.status === "reconcile" ? (
        <div
          ref={statusReference}
          className="account-activation-status"
          role="alert"
          tabIndex={-1}
        >
          <strong>Account activation needs review</strong>
          <p>No private data was opened. Try again later.</p>
        </div>
      ) : state.status === "retry" ? (
        <div
          ref={statusReference}
          className="account-activation-status"
          role="alert"
          tabIndex={-1}
        >
          <strong>Account readiness is temporarily unavailable</strong>
          <p>No readiness decision was made. Retry the server check.</p>
        </div>
      ) : (
        <p>
          Activate the internal account boundary before creating private
          profiles or calculations.
        </p>
      )}
      {state.status === "idle" || state.status === "retry" ? (
        <form action={formAction} aria-busy={pending}>
          <button type="submit" disabled={pending}>
            {pending
              ? "Checking account…"
              : state.status === "retry"
                ? "Retry account activation"
                : "Activate private account"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function SignInForm() {
  const prefix = useId();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = normalizedEmail(data.get("email"));
    const password = stringValue(data.get("password"));
    if (!email || !validPassword(password)) {
      setFeedback(
        error("Enter a valid email and a password from 12 to 128 characters."),
      );
      clearPasswords(form);
      return;
    }
    setPending(true);
    setFeedback(null);
    const result = await postAuthMutation("/api/auth/sign-in/email", {
      email,
      password,
      callbackURL: "/account",
      rememberMe: data.get("rememberMe") === "on",
    });
    clearPasswords(form);
    setPending(false);
    setFeedback(signInFeedback(result));
    if (result.status === "authenticated")
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
  }

  return (
    <section className="account-panel" aria-labelledby={`${prefix}-heading`}>
      <p className="section-kicker">Existing account</p>
      <h2 id={`${prefix}-heading`}>Sign in</h2>
      <form className="account-form" onSubmit={submit} aria-busy={pending}>
        <FormField id={`${prefix}-email`} label="Email">
          <input
            id={`${prefix}-email`}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            maxLength={254}
            required
          />
        </FormField>
        <FormField id={`${prefix}-password`} label="Password">
          <input
            id={`${prefix}-password`}
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            maxLength={128}
            required
          />
        </FormField>
        <label className="account-checkbox">
          <input name="rememberMe" type="checkbox" />
          <span>Keep me signed in on this device</span>
        </label>
        <FeedbackMessage feedback={feedback} />
        <button
          className="account-primary-action"
          type="submit"
          disabled={pending}
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <nav className="account-support-links" aria-label="Sign-in help">
        <Link href="/account/forgot-password">Forgot password?</Link>
        <Link href="/account/verify-email">Need a verification email?</Link>
        <Link href="/account/sign-up">Create an account</Link>
      </nav>
    </section>
  );
}

export function SignUpForm() {
  const prefix = useId();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = stringValue(data.get("name")).trim();
    const email = normalizedEmail(data.get("email"));
    const password = stringValue(data.get("password"));
    const confirmation = stringValue(data.get("passwordConfirmation"));
    if (
      !name ||
      name.length > 100 ||
      !email ||
      !validPassword(password) ||
      password !== confirmation
    ) {
      setFeedback(
        error(
          "Check your name, email, and matching 12-to-128-character passwords.",
        ),
      );
      clearPasswords(form);
      return;
    }
    setPending(true);
    setFeedback(null);
    const result = await postAuthMutation("/api/auth/sign-up/email", {
      name,
      email,
      password,
      callbackURL: "/account/verify-email",
      rememberMe: data.get("rememberMe") === "on",
    });
    clearPasswords(form);
    setPending(false);
    setFeedback(
      genericRequestFeedback(
        result,
        "If the request can be completed, check your email for the next step.",
      ),
    );
  }

  return (
    <section className="account-panel" aria-labelledby={`${prefix}-heading`}>
      <p className="section-kicker">New account</p>
      <h2 id={`${prefix}-heading`}>Create your account</h2>
      <form className="account-form" onSubmit={submit} aria-busy={pending}>
        <FormField id={`${prefix}-name`} label="Name">
          <input
            id={`${prefix}-name`}
            name="name"
            type="text"
            autoComplete="name"
            maxLength={100}
            required
          />
        </FormField>
        <FormField id={`${prefix}-email`} label="Email">
          <input
            id={`${prefix}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
          />
        </FormField>
        <FormField
          id={`${prefix}-password`}
          label="Password"
          help="Use 12 to 128 characters."
        >
          <input
            id={`${prefix}-password`}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </FormField>
        <FormField id={`${prefix}-confirmation`} label="Confirm password">
          <input
            id={`${prefix}-confirmation`}
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </FormField>
        <label className="account-checkbox">
          <input name="rememberMe" type="checkbox" />
          <span>Keep me signed in on this device</span>
        </label>
        <FeedbackMessage feedback={feedback} />
        <button
          className="account-primary-action"
          type="submit"
          disabled={pending}
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="account-support-links">
        <Link href="/account/sign-in">Already have an account? Sign in</Link>
      </p>
    </section>
  );
}

export function ForgotPasswordForm() {
  const prefix = useId();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = normalizedEmail(new FormData(form).get("email"));
    if (!email) {
      setFeedback(error("Enter a valid email address."));
      return;
    }
    setPending(true);
    setFeedback(null);
    const result = await postAuthMutation("/api/auth/request-password-reset", {
      email,
      redirectTo: "/account/reset-password",
    });
    form.reset();
    setPending(false);
    setFeedback(
      genericRequestFeedback(
        result,
        "If an eligible account exists, reset instructions will be sent.",
      ),
    );
  }

  return (
    <section className="account-panel" aria-labelledby={`${prefix}-heading`}>
      <p className="section-kicker">Account recovery</p>
      <h2 id={`${prefix}-heading`}>Request a password reset</h2>
      <p>
        For privacy, the result does not confirm whether an address has an
        account.
      </p>
      <form className="account-form" onSubmit={submit} aria-busy={pending}>
        <FormField id={`${prefix}-email`} label="Email">
          <input
            id={`${prefix}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
          />
        </FormField>
        <FeedbackMessage feedback={feedback} />
        <button
          className="account-primary-action"
          type="submit"
          disabled={pending}
        >
          {pending ? "Requesting…" : "Send reset instructions"}
        </button>
      </form>
      <p className="account-support-links">
        <Link href="/account/sign-in">Return to sign in</Link>
      </p>
    </section>
  );
}

export function VerifyEmailForm() {
  const prefix = useId();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = normalizedEmail(new FormData(form).get("email"));
    if (!email) {
      setFeedback(error("Enter a valid email address."));
      return;
    }
    setPending(true);
    setFeedback(null);
    const result = await postAuthMutation("/api/auth/send-verification-email", {
      email,
      callbackURL: "/account",
    });
    form.reset();
    setPending(false);
    setFeedback(
      genericRequestFeedback(
        result,
        "If the request is eligible, a verification email will be sent.",
      ),
    );
  }

  return (
    <section className="account-panel" aria-labelledby={`${prefix}-heading`}>
      <p className="section-kicker">Email verification</p>
      <h2 id={`${prefix}-heading`}>Check your inbox</h2>
      <p>
        Open the newest verification link on this device. Links are time-limited
        and can be used only for verification.
      </p>
      <form className="account-form" onSubmit={submit} aria-busy={pending}>
        <FormField id={`${prefix}-email`} label="Email">
          <input
            id={`${prefix}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
          />
        </FormField>
        <FeedbackMessage feedback={feedback} />
        <button
          className="account-primary-action"
          type="submit"
          disabled={pending}
        >
          {pending ? "Requesting…" : "Send another verification email"}
        </button>
      </form>
      <p className="account-support-links">
        <Link href="/account/sign-in">Return to sign in</Link>
      </p>
    </section>
  );
}

export function ResetPasswordForm() {
  const prefix = useId();
  const token = useRef<string | null>(null);
  const initialized = useRef(false);
  const [linkState, setLinkState] = useState<"checking" | "ready" | "invalid">(
    "checking",
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const candidate = new URLSearchParams(window.location.search).get("token");
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.hash}`,
    );
    if (candidate && /^[A-Za-z0-9_-]{24}$/.test(candidate)) {
      token.current = candidate;
      queueMicrotask(() => setLinkState("ready"));
    } else {
      queueMicrotask(() => setLinkState("invalid"));
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = stringValue(data.get("newPassword"));
    const confirmation = stringValue(data.get("passwordConfirmation"));
    const currentToken = token.current;
    if (
      !currentToken ||
      !validPassword(password) ||
      password !== confirmation
    ) {
      setFeedback(error("Use matching passwords from 12 to 128 characters."));
      clearPasswords(form);
      return;
    }
    setPending(true);
    setFeedback(null);
    const result = await postAuthMutation("/api/auth/reset-password", {
      newPassword: password,
      token: currentToken,
    });
    clearPasswords(form);
    setPending(false);
    if (result.status === "accepted") {
      token.current = null;
      setLinkState("invalid");
      setFeedback(success("Your password was updated. You can now sign in."));
    } else if (
      result.status === "rate-limited" ||
      result.status === "unavailable"
    ) {
      setFeedback(resultFeedback(result));
    } else {
      token.current = null;
      setLinkState("invalid");
      setFeedback(resultFeedback(result));
    }
  }

  if (linkState === "checking")
    return (
      <section className="account-panel account-status" aria-live="polite">
        Checking the reset link…
      </section>
    );

  return (
    <section className="account-panel" aria-labelledby={`${prefix}-heading`}>
      <p className="section-kicker">Secure recovery</p>
      <h2 id={`${prefix}-heading`}>Choose a new password</h2>
      {linkState === "ready" ? (
        <form className="account-form" onSubmit={submit} aria-busy={pending}>
          <FormField
            id={`${prefix}-password`}
            label="New password"
            help="Use 12 to 128 characters."
          >
            <input
              id={`${prefix}-password`}
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </FormField>
          <FormField id={`${prefix}-confirmation`} label="Confirm new password">
            <input
              id={`${prefix}-confirmation`}
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </FormField>
          <FeedbackMessage feedback={feedback} />
          <button
            className="account-primary-action"
            type="submit"
            disabled={pending}
          >
            {pending ? "Updating password…" : "Update password"}
          </button>
        </form>
      ) : (
        <div className="account-status" role="alert">
          <p>
            {feedback?.message ??
              "This reset link is unavailable or has already been used."}
          </p>
          <Link href="/account/forgot-password">Request a new reset link</Link>
        </div>
      )}
    </section>
  );
}

function FormField({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help ? <small>{help}</small> : null}
    </div>
  );
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  const reference = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (feedback?.tone === "error") reference.current?.focus();
  }, [feedback]);
  if (!feedback) return <p className="account-feedback" aria-live="polite" />;
  return (
    <p
      ref={reference}
      className={`account-feedback ${feedback.tone}`}
      role={feedback.tone === "error" ? "alert" : "status"}
      tabIndex={feedback.tone === "error" ? -1 : undefined}
    >
      {feedback.message}
    </p>
  );
}

function signInFeedback(result: AuthMutationResult): Feedback {
  if (result.status === "authenticated")
    return success("Signed in. Continue to your account.");
  if (result.status === "verification-required")
    return error(
      "Email verification is required before sign-in. Request a new verification email if needed.",
    );
  return resultFeedback(result);
}

function genericRequestFeedback(
  result: AuthMutationResult,
  acceptedMessage: string,
): Feedback {
  return result.status === "accepted" || result.status === "rejected"
    ? success(acceptedMessage)
    : resultFeedback(result);
}

function resultFeedback(result: AuthMutationResult): Feedback {
  if (result.status === "rate-limited")
    return error("Too many attempts. Wait a while before trying again.");
  if (result.status === "unavailable")
    return error(
      "This service is temporarily unavailable. Your request was not confirmed; please retry.",
    );
  return error(
    "The request could not be completed. Check the details and try again.",
  );
}

function normalizedEmail(value: FormDataEntryValue | null): string | null {
  const email = stringValue(value).trim().toLowerCase();
  return email.length >= 3 &&
    email.length <= 254 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(email)
    ? email
    : null;
}

function validPassword(value: string): boolean {
  return (
    value.length >= 12 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function clearPasswords(form: HTMLFormElement): void {
  for (const input of form.querySelectorAll<HTMLInputElement>(
    'input[type="password"]',
  ))
    input.value = "";
}

function error(message: string): NonNullable<Feedback> {
  return { tone: "error", message };
}

function success(message: string): NonNullable<Feedback> {
  return { tone: "success", message };
}
