import { needsTwoFactorEnrollment } from "@/src/lib/auth/enrollment";
import { auth } from "@/src/lib/auth";
import { resolveAuthoritativeSession } from "@/src/lib/auth/sessionAuthority";
import { getSessionCookie } from "better-auth/cookies";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

/** Factor settings stay private; users cannot disable or read them over HTTP. */
const HIDDEN_TWO_FACTOR_PATHS = [
  "two-factor/disable",
  "two-factor/generate-backup-codes",
  "two-factor/get-totp-uri",
];

/**
 * Account and session management that the application wraps in guarded
 * operations (validation, current password, step-up, lifecycle
 * coordination): the provider's direct endpoints would bypass every one of
 * those, so they answer not-found for every caller. Native change-email is
 * disabled in the configuration and hidden here as well. The public reset
 * completion moved to a guarded operation too; its GET link callback
 * (`reset-password/:token`) stays, since emailed links go through it.
 */
const GUARDED_ACCOUNT_PATHS = [
  "update-user",
  "change-password",
  "change-email",
  "list-sessions",
  "revoke-session",
  "revoke-sessions",
  "revoke-other-sessions",
  "reset-password",
];

/**
 * Email codes are a sign-in challenge only. Better Auth serves these two
 * endpoints to signed-in sessions as well, where a successful `verify-otp`
 * doubles as the confirmation step of enrollment: it sets `twoFactorEnabled`
 * and rotates the session even though no authenticator was ever enrolled. The
 * app treats that flag as "has an authenticator", so mid-session use would
 * corrupt the account's factor state. Mid-session email codes are issued by
 * the step-up runtime instead. Recovery codes likewise sign in an anonymous
 * caller only: a signed-in session must not spend them outside the
 * application's policy.
 */
const SIGN_IN_ONLY_TWO_FACTOR_PATHS = [
  "two-factor/send-otp",
  "two-factor/verify-otp",
  "two-factor/verify-backup-code",
];

/** The only endpoints a session that still has to enroll may call. */
const PATHS_ALLOWED_DURING_ENROLLMENT = [
  "get-session",
  "sign-out",
  "two-factor/enable",
  "two-factor/verify-totp",
  "verify-email",
];

const notFound = () => new Response("Not Found", { status: 404 });

async function handle(
  request: Request,
  context: { params: Promise<{ all: string[] }> },
) {
  const { all: segments } = await context.params;
  const path = segments.join("/").replace(/\/+$/, "");

  // Next supplies decoded route segments. Block the entire namespace, including
  // future plugin endpoints, before Better Auth can perform any operation.
  // Keep this at the HTTP boundary: guarded operations may still use auth.api.
  if (path.split("/")[0] === "admin") {
    return notFound();
  }

  if (HIDDEN_TWO_FACTOR_PATHS.includes(path) || GUARDED_ACCOUNT_PATHS.includes(path)) {
    return notFound();
  }

  // Anonymous traffic (sign-in, sign-up, password reset) carries no session
  // cookie, so it skips the store lookup. Callers that do have one are
  // resolved through the session authority: the cookie cache is bypassed and
  // the current user row decides (enrollment state, bans, a pending
  // revocation barrier), never a cached copy.
  const session = getSessionCookie(request)
    ? await resolveAuthoritativeSession(request.headers)
    : null;
  const enrollmentRequired = session && needsTwoFactorEnrollment(session.user);

  if (session && SIGN_IN_ONLY_TWO_FACTOR_PATHS.includes(path)) {
    return notFound();
  }

  // Enrollment is available only to accounts required to enroll. Never allow
  // enabling email OTP to satisfy the authenticator requirement. The optional
  // settings enrollment uses the server API through guarded operations, and
  // so does mid-session step-up; a signed-in `verify-totp` over HTTP would
  // complete a settings attempt without its state checks, so it stays
  // available for required enrollment and anonymous sign-in only.
  if (path === "two-factor/enable" || path === "two-factor/verify-totp") {
    if (session && !enrollmentRequired) {
      return notFound();
    }
    if (path === "two-factor/enable") {
      if (!enrollmentRequired) {
        return notFound();
      }

      const body = await request
        .clone()
        .json()
        .catch(() => null);

      if (body?.method !== "totp") {
        return Response.json(
          { message: "Authenticator enrollment is required." },
          { status: 400 },
        );
      }
    }
  }

  if (enrollmentRequired && !PATHS_ALLOWED_DURING_ENROLLMENT.includes(path)) {
    return Response.json(
      { message: "Complete authenticator enrollment first." },
      { status: 403 },
    );
  }

  return request.method === "GET"
    ? handlers.GET(request)
    : handlers.POST(request);
}

export { handle as GET, handle as POST };
