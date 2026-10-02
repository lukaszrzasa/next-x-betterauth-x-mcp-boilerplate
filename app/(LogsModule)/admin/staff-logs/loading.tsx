import { getTranslations } from "next-intl/server";
import { DataTableSkeleton } from "@/src/components/data-table/DataTableSkeleton";
import { Skeleton } from "@/src/components/ui/skeleton";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import { STAFF_LOGS_COLUMN_SKELETON_WIDTHS } from "@/app/(LogsModule)/admin/_/components/staffLogs/staffLogsColumnWidths";

export default async function StaffLogsLoading() {
  const t = await getTranslations("logsAdmin.staffLogs");
  return (
    <>
      <AppBreadcrumbs
        items={[{ label: "nav.admin", href: appRoutes.dashboard.href }, { label: "nav.groups.system" }, logsRoutes.staffLogs]}
      />
      <div className="ui:flex ui:flex-col ui:gap-6">
        <div className="ui:flex ui:flex-col ui:gap-2">
          <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight">{t("title")}</h1>
          <Skeleton className="ui:h-4 ui:w-96 ui:max-w-full" />
        </div>
        <DataTableSkeleton columnWidths={STAFF_LOGS_COLUMN_SKELETON_WIDTHS} label={t("loading")} />
      </div>
    </>
  );
}
