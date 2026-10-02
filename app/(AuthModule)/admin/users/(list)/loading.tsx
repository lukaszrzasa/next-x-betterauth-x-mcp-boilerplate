import { getTranslations } from "next-intl/server";
import { DataTableSkeleton } from "@/src/components/data-table/DataTableSkeleton";
import { Skeleton } from "@/src/components/ui/skeleton";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { USERS_COLUMN_SKELETON_WIDTHS } from "@/app/(AuthModule)/admin/_/components/users/list/usersColumnWidths";

export default async function UsersLoading() {
  const [t, nav] = await Promise.all([getTranslations("authAdmin"), getTranslations()]);
  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: t("breadcrumbs.admin"), href: appRoutes.dashboard.href },
          { label: nav(authRoutes.adminUsers.label), href: authRoutes.adminUsers.href },
        ]}
      />
      <div className="ui:flex ui:flex-col ui:gap-6">
        <div className="ui:flex ui:flex-col ui:gap-2">
          <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight">{t("list.title")}</h1>
          <Skeleton className="ui:h-4 ui:w-72" />
        </div>
        <DataTableSkeleton columnWidths={USERS_COLUMN_SKELETON_WIDTHS} label={t("list.loading")} />
      </div>
    </>
  );
}
