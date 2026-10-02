import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { page, redirectRefused } from "@/src/lib/app/access";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import { EmailLogsList } from "@/app/(LogsModule)/admin/_/components/emailLogs/EmailLogsList";
import { listEmailLogsQuery } from "@/app/(LogsModule)/admin/_/queries";
import {
  emailLogsUrl,
  parseEmailLogsSearch,
  serializeEmailLogsSearch,
} from "@/app/(LogsModule)/admin/_/queryState";
import type { EmailLogsPage } from "@/app/(LogsModule)/admin/_/types";
import { ActionError } from "@/src/lib/auth/errors";
import { serializeRawSearchParams } from "@/src/lib/data-table/queryState";

const HEADING_ID = "email-logs-heading";

/**
 * The email-log list. The route rule admits the viewer; the read then checks
 * admin access again. Only after that is the URL normalized: unknown or
 * invalid parameters fall back to defaults (an invalid `log` is dropped) and
 * the page redirects to the canonical form, also when the requested page
 * lies past the last one. `log` selects the dialog's record and is carried
 * through untouched; the record itself loads on demand in the browser.
 */
export default page<PageProps<"/admin/email-logs">>(logsRoutes.emailLogs, async ({ searchParams }, session) => {
  const raw = await searchParams;
  const { query, log } = parseEmailLogsSearch(raw);

  let result: EmailLogsPage;
  try {
    result = await listEmailLogsQuery(query);
  } catch (error) {
    // To a non-admin the read does not exist; the guard already redirected such viewers.
    if (ActionError.is(error) && error.reason === "NOT_FOUND") notFound();
    if (ActionError.is(error) && isRefusal(error)) redirectRefused(session);
    throw error;
  }
  if (serializeRawSearchParams(raw) !== serializeEmailLogsSearch(result.query, log)) {
    redirect(emailLogsUrl(result.query, log));
  }
  const t = await getTranslations("logsAdmin.emailLogs");

  return (
    <>
      <AppBreadcrumbs
        items={[{ label: "nav.admin", href: appRoutes.dashboard.href }, { label: "nav.groups.system" }, logsRoutes.emailLogs]}
      />
      <div className="ui:flex ui:flex-col ui:gap-6">
        <div className="ui:flex ui:flex-col ui:gap-1">
          <h1 id={HEADING_ID} tabIndex={-1} className="ui:text-2xl ui:font-semibold ui:tracking-tight ui:outline-none">
            {t("title")}
          </h1>
          <p className="ui:text-sm ui:text-muted-foreground">{t("description")}</p>
        </div>
        <EmailLogsList page={result} headingId={HEADING_ID} />
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
