"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/src/components/data-table/DataTable";
import type { TablePageState, TableSort } from "@/src/components/data-table/types";
import { USER_PAGE_SIZES, type UserPageSize, type UserSort } from "@/app/(AuthModule)/admin/_/schema";
import type { UserListItem, UsersPage, UsersQuery } from "@/app/(AuthModule)/admin/_/types";
import { USERS_COLUMN_IDS } from "./usersColumns";

/** Column IDs that sort, mapped onto the closed query vocabulary. */
const SORTABLE_COLUMNS: Partial<Record<string, UserSort>> = {
  [USERS_COLUMN_IDS.name]: "name",
  [USERS_COLUMN_IDS.createdAt]: "createdAt",
};

/** The list always has a sort; an email sort has no column, so the header shows none. */
function toTableSort(query: UsersQuery): TableSort {
  const column = Object.entries(SORTABLE_COLUMNS).find(([, sort]) => sort === query.sort)?.[0];
  return column ? { id: column, desc: query.direction === "desc" } : null;
}

/**
 * Adapts a users page to the generic table: 1-based query state in, 0-based
 * table state inside, and every table intent reported back as a full query.
 */
export function UsersTable({
  page,
  columns,
  pending,
  toolbar,
  emptyState,
  onQueryChange,
}: {
  page: UsersPage;
  columns: ColumnDef<UserListItem>[];
  pending: boolean;
  toolbar: ReactNode;
  emptyState: ReactNode;
  onQueryChange: (next: UsersQuery) => void;
}) {
  const t = useTranslations("authAdmin.list");
  const { query } = page;

  const onPaginationChange = (next: TablePageState) => {
    const pageSize = (USER_PAGE_SIZES as readonly number[]).includes(next.pageSize)
      ? (next.pageSize as UserPageSize)
      : query.pageSize;
    onQueryChange(
      pageSize === query.pageSize
        ? { ...query, page: next.pageIndex + 1 }
        : { ...query, pageSize, page: 1 },
    );
  };

  const onSortingChange = (next: TableSort) => {
    const sort = next ? SORTABLE_COLUMNS[next.id] : undefined;
    if (!sort) return;
    onQueryChange({ ...query, sort, direction: next!.desc ? "desc" : "asc", page: 1 });
  };

  return (
    <DataTable
      data={page.items}
      columns={columns}
      getRowId={(row) => row.id}
      rowCount={page.total}
      pagination={{ pageIndex: page.page - 1, pageSize: page.pageSize }}
      sorting={toTableSort(query)}
      onPaginationChange={onPaginationChange}
      onSortingChange={onSortingChange}
      pending={pending}
      toolbar={toolbar}
      emptyState={emptyState}
      caption={t("caption")}
      itemLabel={t("itemLabel")}
      pageSizeOptions={USER_PAGE_SIZES}
    />
  );
}
