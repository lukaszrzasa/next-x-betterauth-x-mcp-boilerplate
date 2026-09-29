import { DataTableSkeleton } from "@/src/components/data-table/DataTableSkeleton";
import { Skeleton } from "@/src/components/ui/skeleton";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { USERS_COLUMN_SKELETON_WIDTHS } from "@/app/(AuthModule)/admin/_/components/users/list/usersColumnWidths";

export default function UsersLoading() {
  return (
    <>
      <AppBreadcrumbs
        items={[{ label: "Admin", href: appRoutes.dashboard.href }, authRoutes.adminUsers]}
      />
      <div className="ui:flex ui:flex-col ui:gap-6">
        <div className="ui:flex ui:flex-col ui:gap-2">
          <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight">Users</h1>
          <Skeleton className="ui:h-4 ui:w-72" />
        </div>
        <DataTableSkeleton columnWidths={USERS_COLUMN_SKELETON_WIDTHS} label="Loading users" />
      </div>
    </>
  );
}
