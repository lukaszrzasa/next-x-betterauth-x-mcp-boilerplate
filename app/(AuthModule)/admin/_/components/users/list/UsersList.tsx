"use client";

import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { useTableNavigation } from "@/src/lib/data-table/useTableNavigation";
import { useViewer } from "@/src/components/shell/ViewerProvider";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import {
  clearUsersFilters,
  hasUsersFilters,
  serializeUsersQuery,
} from "@/app/(AuthModule)/admin/_/queryState";
import type { UsersPage } from "@/app/(AuthModule)/admin/_/types";
import { usersColumns } from "./usersColumns";
import { UsersFilters } from "./UsersFilters";
import { UsersTable } from "./UsersTable";

/**
 * The list as the browser sees it: the server-rendered page plus the URL
 * navigation that requests the next one. Every control derives from
 * `page.query`, so Back/Forward and a canonical redirect restore them.
 */
export function UsersList({ page }: { page: UsersPage }) {
  const { can } = useViewer();
  const canViewDetail = can(authRoutes.adminUser.access);
  const { navigate, navigateDebounced, flush, pending } = useTableNavigation({
    pathname: authRoutes.adminUsers.href,
    query: page.query,
    serialize: serializeUsersQuery,
  });
  const columns = useMemo(
    () => usersColumns({ canViewDetail, listQuery: page.query }),
    [canViewDetail, page.query],
  );
  const filtered = hasUsersFilters(page.query);

  return (
    <UsersTable
      page={page}
      columns={columns}
      pending={pending}
      onQueryChange={navigate}
      toolbar={
        <UsersFilters
          query={page.query}
          pending={pending}
          onChange={navigate}
          onSearchChange={navigateDebounced}
          onSearchSubmit={flush}
        />
      }
      emptyState={
        <div className="ui:flex ui:flex-col ui:items-center ui:gap-3">
          <p className="ui:text-muted-foreground">
            {filtered ? "No users match these filters." : "No users yet."}
          </p>
          {filtered && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => navigate(clearUsersFilters(page.query))}
            >
              Clear filters
            </Button>
          )}
        </div>
      }
    />
  );
}
