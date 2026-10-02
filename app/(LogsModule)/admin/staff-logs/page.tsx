import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { page, redirectRefused } from "@/src/lib/app/access";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import { StaffLogsList } from "@/app/(LogsModule)/admin/_/components/staffLogs/StaffLogsList";
import { listStaffLogFilterOptionsQuery, listStaffLogsQuery } from "@/app/(LogsModule)/admin/_/queries";
import {
  parseStaffLogsSearch,
  serializeStaffLogsSearch,
  staffLogsUrl,
} from "@/app/(LogsModule)/admin/_/queryState";
import type { StaffLogFilterOptions, StaffLogsPage } from "@/app/(LogsModule)/admin/_/types";
import { ActionError } from "@/src/lib/auth/errors";
import { serializeRawSearchParams } from "@/src/lib/data-table/queryState";

/**
 * The staff log. The route rule admits the viewer; the reads then check
 * admin access again. Only after that is the URL normalized: unknown or
 * invalid parameters fall back to defaults and the page redirects to the
 * canonical form, also when the requested page lies past the last one.
 */
export default page<PageProps<"/admin/staff-logs">>(logsRoutes.staffLogs, async ({ searchParams }, session) => {
  const raw = await searchParams;

  let result: StaffLogsPage;
  let options: StaffLogFilterOptions;
  try {
    [result, options] = await Promise.all([
      listStaffLogsQuery(parseStaffLogsSearch(raw)),
      listStaffLogFilterOptionsQuery(undefined),
    ]);
  } catch (error) {
    // To a non-admin the read does not exist; the guard already redirected such viewers.
    if (ActionError.is(error) && error.reason === "NOT_FOUND") notFound();
    if (ActionError.is(error) && isRefusal(error)) redirectRefused(session);
    throw error;
  }
  if (serializeRawSearchParams(raw) !== serializeStaffLogsSearch(result.query)) {
    redirect(staffLogsUrl(result.query));
  }
  const t = await getTranslations("logsAdmin.staffLogs");

  return (
    <>
      <AppBreadcrumbs
        items={[{ label: "nav.admin", href: appRoutes.dashboard.href }, { label: "nav.groups.system" }, logsRoutes.staffLogs]}
      />
      <div className="ui:flex ui:flex-col ui:gap-6">
        <div className="ui:flex ui:flex-col ui:gap-1">
          <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight">{t("title")}</h1>
          <p className="ui:text-sm ui:text-muted-foreground">{t("description")}</p>
        </div>
        <StaffLogsList page={result} options={options} />
      </div>
    </>
  );
});

function isRefusal(error: ActionError): boolean {
  return (
    error.reason === "UNAUTHENTICATED" ||
    error.reason === "FORBIDDEN" ||
    error.reason === "TWO_FACTOR_ENROLLMENT_REQUIRED"
  );
}
