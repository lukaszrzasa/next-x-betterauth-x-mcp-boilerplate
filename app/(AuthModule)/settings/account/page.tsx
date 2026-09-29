import { page, redirectRefused } from "@/src/lib/app/access";
import { AccountSettings } from "@/app/(AuthModule)/_/components/settings/account/AccountSettings";
import { SESSIONS_PAGE_PARAM } from "@/app/(AuthModule)/_/components/settings/account/SessionList";
import { requireEnrolledSession } from "@/app/(AuthModule)/_/guards";
import { getAccountQuery, listSessionsQuery } from "@/app/(AuthModule)/_/queries";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { sessionPageSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { ActionError } from "@/src/lib/auth/errors";

/**
 * Sign-in email, password, authenticator, recovery codes and sessions. Both
 * reads run through the trusted server-render entry point after the explicit
 * enrollment guard; the sessions page number comes from the URL, validated
 * and clamped server-side.
 */
export default page<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>(
  authRoutes.settingsAccount,
  async ({ searchParams }, session) => {
    await requireEnrolledSession();
    const query = await searchParams;
    const requested = sessionPageSchema.safeParse(Number(query[SESSIONS_PAGE_PARAM] ?? 1));
    const sessionsPage = requested.success ? requested.data : 1;

    let account;
    let sessions;
    try {
      [account, sessions] = await Promise.all([
        getAccountQuery(undefined),
        listSessionsQuery({ page: sessionsPage }),
      ]);
    } catch (error) {
      if (ActionError.is(error) && error.reason !== "INTERNAL") redirectRefused(session);
      throw error;
    }

    return <AccountSettings account={account} sessions={sessions} />;
  },
);
