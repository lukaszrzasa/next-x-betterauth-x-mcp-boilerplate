import { needsTwoFactorEnrollment } from "@/src/lib/auth/enrollment";
import { auth } from "@/src/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

/** Factor settings stay private; users cannot disable or read them over HTTP. */
const HIDDEN_TWO_FACTOR_PATHS = [
  "two-factor/disable",
  "two-factor/generate-backup-codes",
  "two-factor/get-totp-uri",
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

  if (HIDDEN_TWO_FACTOR_PATHS.includes(path)) {
    return notFound();
  }

  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  const enrollmentRequired = session && needsTwoFactorEnrollment(session.user);

  // Enrollment is available only to accounts required to enroll. Never allow
  // enabling email OTP to satisfy the authenticator requirement.
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
