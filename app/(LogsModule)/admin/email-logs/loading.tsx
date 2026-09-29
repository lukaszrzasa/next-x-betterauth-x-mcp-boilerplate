import { DataTableSkeleton } from "@/src/components/data-table/DataTableSkeleton";
import { Skeleton } from "@/src/components/ui/skeleton";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import { EMAIL_LOGS_COLUMN_SKELETON_WIDTHS } from "@/app/(LogsModule)/admin/_/components/emailLogs/emailLogsColumnWidths";

export default function EmailLogsLoading() {
  return (
    <>
      <AppBreadcrumbs
        items={[{ label: "Admin", href: appRoutes.dashboard.href }, { label: "System" }, logsRoutes.emailLogs]}
      />
      <div className="ui:flex ui:flex-col ui:gap-6">
        <div className="ui:flex ui:flex-col ui:gap-2">
          <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight">Email logs</h1>
          <Skeleton className="ui:h-4 ui:w-96 ui:max-w-full" />
        </div>
        <DataTableSkeleton columnWidths={EMAIL_LOGS_COLUMN_SKELETON_WIDTHS} label="Loading email logs" />
      </div>
    </>
  );
}
