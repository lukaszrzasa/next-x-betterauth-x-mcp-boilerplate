import { DataTableSkeleton } from "@/src/components/data-table/DataTableSkeleton";
import { Skeleton } from "@/src/components/ui/skeleton";
import { AppBreadcrumbs } from "@/app/_/shell/AppBreadcrumbs";
import { adminRoutes } from "@/app/(AdminModule)/_/routes";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import { STAFF_LOGS_COLUMN_SKELETON_WIDTHS } from "@/app/(LogsModule)/admin/_/components/staffLogs/staffLogsColumnWidths";

export default function StaffLogsLoading() {
  return (
    <>
      <AppBreadcrumbs
        items={[{ label: "Admin", href: adminRoutes.dashboard.href }, { label: "System" }, logsRoutes.staffLogs]}
      />
      <div className="ui:flex ui:flex-col ui:gap-6">
        <div className="ui:flex ui:flex-col ui:gap-2">
          <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight">Staff log</h1>
          <Skeleton className="ui:h-4 ui:w-96 ui:max-w-full" />
        </div>
        <DataTableSkeleton columnWidths={STAFF_LOGS_COLUMN_SKELETON_WIDTHS} label="Loading the staff log" />
      </div>
    </>
  );
}
