"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useFormatter, type useTranslations } from "next-intl";
import { DataTableColumnHeader } from "@/src/components/data-table/DataTableColumnHeader";
import { UserAvatar } from "@/src/components/identity/UserAvatar";
import { buttonVariants } from "@/src/components/ui/button";
import { toIsoInstant } from "@/src/lib/date/format";
import { buildRoute } from "@/src/lib/routes";
import { cn } from "@/src/lib/utils";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { userDetailUrl } from "@/app/(AuthModule)/admin/_/queryState";
import type { UserListItem, UsersQuery } from "@/app/(AuthModule)/admin/_/types";
import { AccessBadge, RoleBadges, VerificationBadge } from "@/app/(AuthModule)/admin/_/components/users/UserBadges";

/** Column IDs double as the sort vocabulary the list maps onto the query. */
export const USERS_COLUMN_IDS = {
  name: "name",
  roles: "roles",
  verification: "verification",
  access: "access",
  createdAt: "createdAt",
  actions: "actions",
} as const;

export type UsersColumnsOptions = {
  /** Presentation only: the detail page enforces its own access. */
  canViewDetail: boolean;
  /** Carried to the detail page so Back returns to this exact list. */
  listQuery: UsersQuery;
  /** The `authAdmin.list` translator of the rendering component; columns are plain values. */
  t: ReturnType<typeof useTranslations<"authAdmin.list">>;
};

/** A cell that renders an instant: the day shown, the full moment on hover. */
function CreatedCell({ value }: { value: string }) {
  const format = useFormatter();
  const date = new Date(value);
  return (
    <time dateTime={toIsoInstant(value)} title={format.dateTime(date, "dateTime")} className="ui:text-muted-foreground">
      {format.dateTime(date, "date")}
    </time>
  );
}

function detailHref(userId: string, listQuery: UsersQuery): string {
  return userDetailUrl(buildRoute(authRoutes.adminUser.href, { userId }), listQuery);
}

export function usersColumns({ canViewDetail, listQuery, t }: UsersColumnsOptions): ColumnDef<UserListItem>[] {
  return [
    {
      id: USERS_COLUMN_IDS.name,
      accessorKey: "name",
      enableSorting: true,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("columns.user")} />,
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="ui:flex ui:min-w-0 ui:max-w-xs ui:items-center ui:gap-3 ui:sm:max-w-sm">
            <UserAvatar name={user.name} email={user.email} image={user.image} />
            <div className="ui:min-w-0">
              {canViewDetail ? (
                <Link
                  href={detailHref(user.id, listQuery)}
                  prefetch={false}
                  className="ui:block ui:truncate ui:font-medium ui:text-foreground ui:underline-offset-4 ui:hover:underline"
                >
                  {user.name}
                </Link>
              ) : (
                <span className="ui:block ui:truncate ui:font-medium">{user.name}</span>
              )}
              <span className="ui:block ui:truncate ui:text-xs ui:text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: USERS_COLUMN_IDS.roles,
      enableSorting: false,
      header: t("columns.roles"),
      cell: ({ row }) => <RoleBadges roles={row.original.roles} />,
    },
    {
      id: USERS_COLUMN_IDS.verification,
      enableSorting: false,
      header: t("columns.verification"),
      cell: ({ row }) => <VerificationBadge verified={row.original.emailVerified} />,
    },
    {
      id: USERS_COLUMN_IDS.access,
      enableSorting: false,
      header: t("columns.access"),
      cell: ({ row }) => (
        <AccessBadge status={row.original.accessStatus} banExpires={row.original.banExpires} />
      ),
    },
    {
      id: USERS_COLUMN_IDS.createdAt,
      accessorKey: "createdAt",
      enableSorting: true,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("columns.created")} />,
      cell: ({ row }) => <CreatedCell value={row.original.createdAt} />,
    },
    {
      id: USERS_COLUMN_IDS.actions,
      enableSorting: false,
      header: () => <span className="ui:sr-only">{t("columns.actions")}</span>,
      cell: ({ row }) =>
        canViewDetail ? (
          <Link
            href={detailHref(row.original.id, listQuery)}
            prefetch={false}
            aria-label={t("viewUserNamed", { name: row.original.name })}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ui:text-muted-foreground")}
          >
            {t("viewUser")}
          </Link>
        ) : null,
    },
  ];
}
