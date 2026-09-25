import "server-only";
import { redirect } from "next/navigation";
import { needsTwoFactorEnrollment } from "@/src/lib/auth/enrollment";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { getFreshSession } from "@/src/lib/auth/session";

export async function requireGuest() {
  const session = await getFreshSession();

  if (session) {
    redirect(
      needsTwoFactorEnrollment(session.user) ? authRoutes.enroll.href : authRoutes.panel.href,
    );
  }
}

/** Signed-in users who still have to enroll are sent to enrollment. */
export async function requireEnrolledSession() {
  const session = await getFreshSession();

  if (!session) {
    redirect(authRoutes.signIn.href);
  }

  if (needsTwoFactorEnrollment(session.user)) {
    redirect(authRoutes.enroll.href);
  }

  return session;
}

/** Only signed-in users who still have to enroll may open enrollment. */
export async function requirePendingEnrollment() {
  const session = await getFreshSession();

  if (!session) {
    redirect(authRoutes.signIn.href);
  }

  if (!needsTwoFactorEnrollment(session.user)) {
    redirect(authRoutes.panel.href);
  }

  return session;
}
