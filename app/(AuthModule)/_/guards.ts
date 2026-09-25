import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { needsTwoFactorEnrollment } from "@/src/lib/auth/enrollment";
import { auth } from "@/src/lib/auth";

/** Reads the session store; the cookie cache may be up to `maxAge` stale. */
async function getFreshSession() {
  return auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
}

export async function requireGuest() {
  const session = await getFreshSession();

  if (session) {
    redirect(
      needsTwoFactorEnrollment(session.user) ? "/auth/enroll" : "/panel",
    );
  }
}

/** Signed-in users who still have to enroll are sent to enrollment. */
export async function requireEnrolledSession() {
  const session = await getFreshSession();

  if (!session) {
    redirect("/auth/sign-in");
  }

  if (needsTwoFactorEnrollment(session.user)) {
    redirect("/auth/enroll");
  }

  return session;
}

/** Only signed-in users who still have to enroll may open enrollment. */
export async function requirePendingEnrollment() {
  const session = await getFreshSession();

  if (!session) {
    redirect("/auth/sign-in");
  }

  if (!needsTwoFactorEnrollment(session.user)) {
    redirect("/panel");
  }

  return session;
}
