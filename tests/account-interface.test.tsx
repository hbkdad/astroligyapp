// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AccountActivation,
  AccountDeletion,
  AccountOverview,
  ForgotPasswordForm,
  ResetPasswordForm,
  SignInForm,
  SignUpForm,
  type AccountActivationAction,
  type AccountDeletionAction,
} from "@/components/account-experiences";
import { AccountNavigation } from "@/components/account-navigation";
import {
  parseMutationResponse,
  parseSessionResponse,
} from "@/presentation/auth-http-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const unusedDeletionAction = vi.fn<AccountDeletionAction>(async () => ({
  status: "retry",
}));

describe("account HTTP projection", () => {
  it("accepts only exact Goal 64 public response shapes", async () => {
    await expect(
      parseSessionResponse(
        json(200, {
          status: "authenticated",
          user: {
            name: "Mira Chen",
            email: "mira@example.test",
            emailVerified: true,
            id: "private-id",
          },
        }),
      ),
    ).resolves.toEqual({ status: "unavailable" });

    await expect(
      parseMutationResponse(json(200, { status: "authenticated" })),
    ).resolves.toEqual({ status: "authenticated" });
    await expect(
      parseMutationResponse(json(200, { status: "rejected" })),
    ).resolves.toEqual({ status: "unavailable" });
  });
});

describe("account entry and recovery journeys", () => {
  it("updates shared navigation from the projected session without using it as authorization", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json(200, {
          status: "authenticated",
          user: {
            name: "Mira Chen",
            email: "mira@example.test",
            emailVerified: true,
          },
        }),
      ),
    );
    render(<AccountNavigation />);

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account/sign-in",
    );
    expect(await screen.findByRole("link", { name: "Mira" })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("submits normalized sign-in fields, clears the password, and exposes no auth identifiers", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(200, { status: "authenticated" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { container } = render(<SignInForm />);

    const email = screen.getByRole("textbox", { name: "Email" });
    const password = screen.getByLabelText("Password");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(password).toHaveAttribute("autocomplete", "current-password");

    await user.type(email, "MIRA@EXAMPLE.TEST");
    await user.type(password, "Passphrase!2026");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Signed in. Continue to your account.",
    );
    expect(password).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, options] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/auth/sign-in/email");
    expect(JSON.parse(String(options?.body))).toEqual({
      email: "mira@example.test",
      password: "Passphrase!2026",
      callbackURL: "/account",
      rememberMe: false,
    });
    expect(container.innerHTML).not.toMatch(/private-id|sessionToken|userId/u);
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("keeps signup rejection generic and uses password-manager-compatible fields", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(400, { status: "rejected" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SignUpForm />);

    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "autocomplete",
      "name",
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "autocomplete",
      "email",
    );
    const password = screen.getByLabelText("Password");
    const confirmation = screen.getByLabelText("Confirm password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(confirmation).toHaveAttribute("autocomplete", "new-password");

    await user.type(screen.getByLabelText("Name"), "Mira Chen");
    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "mira@example.test",
    );
    await user.type(password, "Passphrase!2026");
    await user.type(confirmation, "Passphrase!2026");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If the request can be completed, check your email for the next step.",
    );
    expect(password).toHaveValue("");
    expect(confirmation).toHaveValue("");
  });

  it("gives verification-required sign-in a safe recovery path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json(403, { status: "verification-required" }),
      ),
    );
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "mira@example.test",
    );
    await user.type(screen.getByLabelText("Password"), "Passphrase!2026");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email verification is required",
    );
    expect(
      screen.getByRole("link", { name: "Need a verification email?" }),
    ).toHaveAttribute("href", "/account/verify-email");
  });

  it("announces rate limiting, focuses the failure, and permits a later retry", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(429, { status: "rate-limited" }))
      .mockResolvedValueOnce(json(200, { status: "accepted" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    const email = screen.getByRole("textbox", { name: "Email" });
    await user.clear(email);
    await user.type(email, "mira@example.test");
    expect(email).toHaveValue("mira@example.test");
    await user.click(
      screen.getByRole("button", { name: "Send reset instructions" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many attempts");
    expect(alert).toHaveFocus();

    await user.clear(email);
    await user.type(email, "mira@example.test");
    await user.click(
      screen.getByRole("button", { name: "Send reset instructions" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an eligible account exists, reset instructions will be sent.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("scrubs the reset token from the URL and DOM, uses it once, then clears the form", async () => {
    const resetToken = "AbCdEfGhIjKlMnOpQrStUvWx";
    window.history.replaceState(
      {},
      "",
      `/account/reset-password?token=${resetToken}`,
    );
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(200, { status: "accepted" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { container } = render(<ResetPasswordForm />);

    const submit = await screen.findByRole("button", {
      name: "Update password",
    });
    expect(window.location.search).toBe("");
    expect(container.innerHTML).not.toContain(resetToken);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();

    const password = screen.getByLabelText("New password");
    const confirmation = screen.getByLabelText("Confirm new password");
    await user.type(password, "Replacement!2026");
    await user.type(confirmation, "Replacement!2026");
    await user.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your password was updated.",
    );
    const [, options] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(options?.body))).toEqual({
      newPassword: "Replacement!2026",
      token: resetToken,
    });
    expect(container.innerHTML).not.toContain(resetToken);
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("keeps an unconfirmed reset credential only in memory for a retry", async () => {
    window.history.replaceState(
      {},
      "",
      "/account/reset-password?token=AbCdEfGhIjKlMnOpQrStUvWx",
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(503, { status: "unavailable" }))
      .mockResolvedValueOnce(json(200, { status: "accepted" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await screen.findByRole("button", { name: "Update password" });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.type(
        screen.getByLabelText("New password"),
        "Replacement!2026",
      );
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "Replacement!2026",
      );
      await user.click(screen.getByRole("button", { name: "Update password" }));
      if (attempt === 0) {
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "temporarily unavailable",
        );
      }
    }

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your password was updated.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders projected session details and signs out with an empty request body", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(200, {
          status: "authenticated",
          user: {
            name: "Mira Chen",
            email: "mira@example.test",
            emailVerified: true,
          },
        }),
      )
      .mockResolvedValueOnce(json(200, { status: "accepted" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <AccountOverview
        activationAction={vi.fn<AccountActivationAction>(async () => ({
          status: "ready",
        }))}
        deletionAction={unusedDeletionAction}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Welcome, Mira Chen" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Choose how to continue" }),
    ).toBeVisible();
    const [path, options] = fetchMock.mock.calls[1]!;
    expect(path).toBe("/api/auth/sign-out");
    expect(options?.body).toBeUndefined();
    expect(
      (options?.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("shows session loading, then recovers from an unavailable check", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(json(200, { status: "anonymous" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <AccountOverview
        activationAction={vi.fn<AccountActivationAction>(async () => ({
          status: "ready",
        }))}
        deletionAction={unusedDeletionAction}
      />,
    );

    expect(screen.getByText("Checking your session…")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(
      await screen.findByRole("heading", {
        name: "Session status is temporarily unavailable",
      }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Retry session check" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Choose how to continue" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("activates the private account through a zero-field server action", async () => {
    const activationAction = vi.fn<AccountActivationAction>(async () => ({
      status: "ready",
    }));
    const user = userEvent.setup();
    render(<AccountActivation action={activationAction} />);

    expect(
      screen.getByText(
        "Activate the internal account boundary before creating private profiles or calculations.",
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Activate private account" }),
    );

    await screen.findByText("Private account ready", undefined, {
      timeout: 10_000,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Private account ready",
    );
    expect(activationAction).toHaveBeenCalledOnce();
    const [, formData] = activationAction.mock.calls[0]!;
    expect([...formData.keys()]).toEqual([]);
  });

  it("exposes a disabled checking state while account activation is pending", async () => {
    let finish: ((state: { status: "ready" }) => void) | undefined;
    const activationAction = vi.fn<AccountActivationAction>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<AccountActivation action={activationAction} />);

    await user.click(
      screen.getByRole("button", { name: "Activate private account" }),
    );
    expect(
      await screen.findByRole("button", { name: "Checking account…" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your verified account…",
    );

    finish?.({ status: "ready" });
    expect(await screen.findByText("Private account ready")).toBeVisible();
  });

  it.each([
    ["authenticate", "Verification is required", false],
    ["retry", "temporarily unavailable", true],
    ["reconcile", "needs review", false],
  ] as const)(
    "announces and focuses the %s activation result",
    async (status, message, retryable) => {
      const user = userEvent.setup();
      render(<AccountActivation action={vi.fn(async () => ({ status }))} />);
      await user.click(
        screen.getByRole("button", { name: "Activate private account" }),
      );

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      const retry = screen.queryByRole("button", {
        name: "Retry account activation",
      });
      if (retryable) expect(retry).toBeInTheDocument();
      else expect(retry).not.toBeInTheDocument();
    },
  );

  it("requires exact confirmation and current password in the danger zone", async () => {
    const deletionAction = vi.fn<AccountDeletionAction>(async () => ({
      status: "authorize",
    }));
    const user = userEvent.setup();
    render(<AccountDeletion action={deletionAction} onDeleted={vi.fn()} />);

    expect(
      screen.getByText(/permanently removes local profiles/i),
    ).toBeVisible();
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await user.type(
      screen.getByLabelText("Type DELETE MY ACCOUNT"),
      "DELETE MY ACCOUNT",
    );
    await user.type(
      screen.getByLabelText("Current password"),
      "current-password-123",
    );
    await user.click(
      screen.getByRole("button", { name: "Permanently delete account" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Deletion was not authorized");
    expect(alert).toHaveFocus();
    expect(deletionAction).toHaveBeenCalledOnce();
    const [, data] = deletionAction.mock.calls[0]!;
    expect([...data.keys()]).toEqual([
      "version",
      "confirmation",
      "currentPassword",
    ]);
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("disables double submission and announces the pending deletion", async () => {
    let finish: ((state: { status: "deleted" }) => void) | undefined;
    const deletionAction = vi.fn<AccountDeletionAction>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<AccountDeletion action={deletionAction} onDeleted={vi.fn()} />);
    await user.type(
      screen.getByLabelText("Type DELETE MY ACCOUNT"),
      "DELETE MY ACCOUNT",
    );
    await user.type(screen.getByLabelText("Current password"), "password-123");
    await user.click(
      screen.getByRole("button", { name: "Permanently delete account" }),
    );

    expect(
      await screen.findByRole("button", { name: "Deleting account…" }),
    ).toBeDisabled();
    expect(deletionAction).toHaveBeenCalledOnce();
    finish?.({ status: "deleted" });
  });

  it.each([
    ["authenticate", "Sign in again"],
    ["authorize", "Deletion was not authorized"],
    ["retry", "Deletion is temporarily unavailable"],
  ] as const)(
    "announces and focuses the %s deletion result",
    async (status, title) => {
      const user = userEvent.setup();
      render(
        <AccountDeletion
          action={vi.fn(async () => ({ status }))}
          onDeleted={vi.fn()}
        />,
      );
      await user.type(
        screen.getByLabelText("Type DELETE MY ACCOUNT"),
        "DELETE MY ACCOUNT",
      );
      await user.type(
        screen.getByLabelText("Current password"),
        "password-123",
      );
      await user.click(
        screen.getByRole("button", { name: "Permanently delete account" }),
      );
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(title);
      await waitFor(() => expect(alert).toHaveFocus());
    },
  );

  it.each(["deleted", "reconcile"] as const)(
    "confirms the terminal %s result before leaving the danger zone",
    async (status) => {
      const onDeleted = vi.fn();
      const user = userEvent.setup();
      render(
        <AccountDeletion
          action={vi.fn(async () => ({ status }))}
          onDeleted={onDeleted}
        />,
      );
      await user.type(
        screen.getByLabelText("Type DELETE MY ACCOUNT"),
        "DELETE MY ACCOUNT",
      );
      await user.type(
        screen.getByLabelText("Current password"),
        "password-123",
      );
      await user.click(
        screen.getByRole("button", { name: "Permanently delete account" }),
      );
      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(status));
    },
  );
});

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
