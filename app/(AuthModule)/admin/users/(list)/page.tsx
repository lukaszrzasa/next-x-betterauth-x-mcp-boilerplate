import { notFound, redirect } from "next/navigation";
import { page, redirectRefused } from "@/src/lib/app/access";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { UsersList } from "@/app/(AuthModule)/admin/_/components/users/list/UsersList";
import { listUsersQuery } from "@/app/(AuthModule)/admin/_/queries";
import {
  parseUsersQuery,
  serializeUsersQuery,
  usersListUrl,
} from "@/app/(AuthModule)/admin/_/queryState";
import type { UsersPage } from "@/app/(AuthModule)/admin/_/types";
import { ActionError } from "@/src/lib/auth/errors";
import { serializeRawSearchParams } from "@/src/lib/data-table/queryState";

/**
 * The user list. The route rule admits the viewer; the read then checks its
 * own permission. The URL is normalized only after that: unknown or invalid
 * parameters fall back to defaults and the page redirects to the canonical
 * form (also when a requested page lies past the last one).
 */
export default page<PageProps<"/admin/users">>(
  authRoutes.adminUsers,
  async ({ searchParams }, session) => {
    const raw = await searchParams;
    const query = parseUsersQuery(raw);
    if (serializeRawSearchParams(raw) !== serializeUsersQuery(query)) {
      redirect(usersListUrl(query));
    }

    let result: UsersPage;
    try {
      result = await listUsersQuery(query);
    } catch (error) {
      // To a non-staff account the read does not exist; the guard already
      // redirected such viewers, so this is the belt to that suspenders.
      if (ActionError.is(error) && error.reason === "NOT_FOUND") notFound();
      if (ActionError.is(error) && isRefusal(error)) redirectRefused(session);
      throw error;
    }
    if (result.page !== query.page) {
      redirect(usersListUrl(result.query));
    }

    return (
      <>
        <AppBreadcrumbs
          items={[{ label: "Admin", href: appRoutes.dashboard.href }, authRoutes.adminUsers]}
        />
        <div className="ui:flex ui:flex-col ui:gap-6">
          <div className="ui:flex ui:flex-col ui:gap-1">
            <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight">Users</h1>
            <p className="ui:text-sm ui:text-muted-foreground">
              Every account, including banned and staff accounts. Open a user to review or change it.
            </p>
          </div>
          <UsersList page={result} />
        </div>
      </>
    );
  },
);

function isRefusal(error: ActionError): boolean {
  return (
    error.reason === "UNAUTHENTICATED" ||
    error.reason === "FORBIDDEN" ||
    error.reason === "TWO_FACTOR_ENROLLMENT_REQUIRED"
  );
}
