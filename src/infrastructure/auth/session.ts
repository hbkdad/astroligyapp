export type SessionVerification =
  | {
      status: "active";
      subject: string;
      sessionId: string;
      expiresAt: Date;
      authenticatedAt: Date;
    }
  | {
      status: "unauthenticated" | "expired" | "revoked" | "invalid";
    };

export interface SessionVerifier {
  verify(request: Request): Promise<SessionVerification>;
}

export type ActiveSession = Extract<SessionVerification, { status: "active" }>;

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor() {
    super("Authentication is required");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireActiveSession(
  verifier: SessionVerifier,
  request: Request,
  now: () => Date = () => new Date(),
): Promise<ActiveSession> {
  const verification = await verifier.verify(request);
  const currentTime = now().getTime();

  if (
    verification.status !== "active" ||
    !verification.subject.trim() ||
    verification.subject.length > 512 ||
    !verification.sessionId.trim() ||
    verification.sessionId.length > 512 ||
    !Number.isFinite(verification.expiresAt.getTime()) ||
    !Number.isFinite(verification.authenticatedAt.getTime()) ||
    verification.expiresAt.getTime() <= currentTime ||
    verification.authenticatedAt.getTime() > currentTime
  ) {
    throw new AuthenticationRequiredError();
  }

  return verification;
}
