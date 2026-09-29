"use client";

import { DataTable } from "@/src/components/data-table/DataTable";
import type { TablePageState } from "@/src/components/data-table/types";
import { useTableNavigation } from "@/src/lib/data-table/useTableNavigation";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import {
  clearStaffLogsFilters,
  hasStaffLogsFilters,
  serializeStaffLogsSearch,
  withStaffLogsQueryChange,
} from "@/app/(LogsModule)/admin/_/queryState";
import { LOG_PAGE_SIZES, type LogPageSize } from "@/app/(LogsModule)/admin/_/schema";
import type { StaffLogFilterOptions, StaffLogsPage } from "@/app/(LogsModule)/admin/_/types";
import { EmptyState } from "@/app/(LogsModule)/admin/_/components/shared/EmptyState";
import { staffLogsColumns } from "./staffLogsColumns";
import { StaffLogsFilters } from "./StaffLogsFilters";

/**
 * The staff log as the page's main view: the server-rendered page and URL
 * navigation for the next one, so filters and pagination can be linked and
 * survive Back/Forward. Embedded in another page, the log is
 * `StaffLogWidget` instead.
 */
export function StaffLogsList({ page, options }: { page: StaffLogsPage; options: StaffLogFilterOptions }) {
  const { query } = page;
  const { navigate, navigateDebounced, flush, pending } = useTableNavigation({
    pathname: logsRoutes.staffLogs.href,
    query,
    serialize: serializeStaffLogsSearch,
  });

  const onPaginationChange = (next: TablePageState) => {
    const pageSize = (LOG_PAGE_SIZES as readonly number[]).includes(next.pageSize)
      ? (next.pageSize as LogPageSize)
      : query.pageSize;
    navigate(pageSize === query.pageSize ? { ...query, page: next.pageIndex + 1 } : { ...query, pageSize, page: 1 });
  };

  return (
    <DataTable
      data={page.items}
      columns={staffLogsColumns}
      getRowId={(row) => row.id}
      rowCount={page.total}
      pagination={{ pageIndex: page.page - 1, pageSize: page.pageSize }}
      sorting={null}
      onPaginationChange={onPaginationChange}
      onSortingChange={() => undefined}
      pending={pending}
      toolbar={
        <StaffLogsFilters
          query={query}
          options={options}
          pending={pending}
          onChange={navigate}
          onSearchChange={navigateDebounced}
          onSearchSubmit={flush}
        />
      }
      emptyState={
        <EmptyState
          query={query}
          pending={pending}
          noun="staff actions"
          filteredText="No staff actions match these filters."
          neverText="No staff actions have been logged yet."
          onClear={() => navigate(clearStaffLogsFilters(query))}
          onAllTime={() => navigate(withStaffLogsQueryChange(query, { range: "all", from: "", to: "" }))}
          filtered={hasStaffLogsFilters({ ...query, range: "30d", from: "", to: "" })}
        />
      }
      caption="Staff actions, with time, staff member and what was done"
      itemLabel="staff actions"
      pageSizeOptions={LOG_PAGE_SIZES}
    />
  );
}
