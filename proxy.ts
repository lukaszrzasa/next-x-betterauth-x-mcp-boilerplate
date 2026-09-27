import { NextResponse, type NextRequest } from "next/server";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import { auth, sessionCookieCache } from "@/src/lib/auth";
import { needsTwoFactorEnrollment } from "@/src/lib/auth/enrollment";
import { isInstallationComplete } from "@/src/lib/auth/installation";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** The cached payload carries this app's user fields, e.g. `twoFactorRequired`. */
type SessionCookieCache = NonNullable<
  Awaited<ReturnType<typeof getCookieCache>>
> &
  typeof auth.$Infer.Session;

/**
 * Pages a session that still has to enroll may open. The email-change
 * confirmation is a public proof page: confirming a mailbox grants no
 * settings access, so it stays reachable during required enrollment.
 */
const PAGES_ALLOWED_DURING_ENROLLMENT: readonly string[] = [
  authRoutes.enroll.href,
  authRoutes.emailConfirmation.href,
  authRoutes.emailChangeConfirmation.href,
];

/**
 * Enrollment state for the global redirect, read from the signed cookie cache.
 * When the cache has expired, one store lookup re-issues it. Access checks
 * (pages, auth routes, actions) re-read the store and do not trust this value.
 */
async function getRedirectUser(request: NextRequest) {
  const cached = await getCookieCache<SessionCookieCache>(
    request,
    sessionCookieCache,
  );

  if (cached) {
    return { user: cached.user, setCookies: [] };
  }

  if (!getSessionCookie(request)) {
    return { user: null, setCookies: [] };
  }

  const { headers, response } = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });

  return { user: response?.user ?? null, setCookies: headers.getSetCookie() };
}

function withCookies(response: NextResponse, setCookies: string[]) {
  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // API calls and form posts get a JSON error; page visits get a redirect.
  const expectsJson = path.startsWith("/api/") || request.method !== "GET";

  if (path === authRoutes.setup.href) {
    return NextResponse.next();
  }

  if (!(await isInstallationComplete())) {
    if (expectsJson) {
      return NextResponse.json(
        { message: "Complete initial setup first." },
        { status: 503 },
      );
    }

    return NextResponse.redirect(new URL(authRoutes.setup.href, request.url));
  }

  if (
    !path.startsWith(`${authRoutes.api.href}/`) &&
    !PAGES_ALLOWED_DURING_ENROLLMENT.includes(path)
  ) {
    const { user, setCookies } = await getRedirectUser(request);

    if (user && needsTwoFactorEnrollment(user)) {
      if (expectsJson) {
        return withCookies(
          NextResponse.json(
            { message: "Complete authenticator enrollment first." },
            { status: 403 },
          ),
          setCookies,
        );
      }

      return withCookies(
        NextResponse.redirect(new URL(authRoutes.enroll.href, request.url)),
        setCookies,
      );
    }

    return withCookies(NextResponse.next(), setCookies);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth-placeholder.svg|next.svg|vercel.svg|file.svg|window.svg|globe.svg).*)",
  ],
};
