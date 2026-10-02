"use client";

import { useCallback, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { DataTable } from "@/src/components/data-table/DataTable";
import type { TablePageState, TableSort } from "@/src/components/data-table/types";
import type { RawSearchParams } from "@/src/lib/data-table/queryState";
import { useTableNavigation } from "@/src/lib/data-table/useTableNavigation";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import {
  clearEmailLogsFilters,
  hasEmailLogsFilters,
  parseEmailLogsSearch,
  serializeEmailLogsSearch,
  withEmailLogsQueryChange,
} from "@/app/(LogsModule)/admin/_/queryState";
import { LOG_PAGE_SIZES, type EmailLogSort, type LogPageSize } from "@/app/(LogsModule)/admin/_/schema";
import type { EmailLogsPage, EmailLogsQuery } from "@/app/(LogsModule)/admin/_/types";
import { useLogSelection } from "@/app/(LogsModule)/admin/_/hooks/useLogSelection";
import { EmptyState } from "@/app/(LogsModule)/admin/_/components/shared/EmptyState";
import { EmailLogDialog } from "./EmailLogDialog";
import { EMAIL_LOGS_COLUMN_IDS, emailLogsColumns } from "./emailLogsColumns";
import { EmailLogsFilters } from "./EmailLogsFilters";

/** Column IDs that sort, mapped onto the closed query vocabulary. */
const SORTABLE_COLUMNS: Partial<Record<string, EmailLogSort>> = {
  [EMAIL_LOGS_COLUMN_IDS.time]: "time",
  [EMAIL_LOGS_COLUMN_IDS.recipient]: "recipient",
  [EMAIL_LOGS_COLUMN_IDS.subject]: "subject",
};

const serializeWithSelection = (raw: RawSearchParams, log: string | null) =>
  serializeEmailLogsSearch(parseEmailLogsSearch(raw).query, log);

/**
 * The email-log list as the browser sees it: the server-rendered page, the
 * URL navigation that requests the next one, and the dialog selected by
 * `?log=`. Table criteria and the selection are independent: changing a
 * filter keeps the open record, and opening a record never refetches the
 * list. Every control derives from `page.query`.
 */
export function EmailLogsList({ page, headingId }: { page: EmailLogsPage; headingId: string }) {
  const pathname = logsRoutes.emailLogs.href;
  const selection = useLogSelection({ pathname, serialize: serializeWithSelection, headingId });
  const { selectedId } = selection;
  const serialize = useCallback((query: EmailLogsQuery) => serializeEmailLogsSearch(query, selectedId), [selectedId]);
  const { navigate, navigateDebounced, flush, pending } = useTableNavigation({ pathname, query: page.query, serialize });
  const { query } = page;
  const t = useTranslations("logsAdmin.emailLogs");
  const format = useFormatter();
  const columns = useMemo(() => emailLogsColumns({ onOpen: selection.open, t, format }), [selection.open, t, format]);

  const sorting: TableSort = { id: query.sort, desc: query.direction === "desc" };
  const onSortingChange = (next: TableSort) => {
    const sort = next ? SORTABLE_COLUMNS[next.id] : undefined;
    if (!sort) return;
    navigate({ ...query, sort, direction: next!.desc ? "desc" : "asc", page: 1 });
  };
  const onPaginationChange = (next: TablePageState) => {
    const pageSize = (LOG_PAGE_SIZES as readonly number[]).includes(next.pageSize)
      ? (next.pageSize as LogPageSize)
      : query.pageSize;
    navigate(pageSize === query.pageSize ? { ...query, page: next.pageIndex + 1 } : { ...query, pageSize, page: 1 });
  };

  return (
    <>
      <DataTable
        data={page.items}
        columns={columns}
        getRowId={(row) => row.id}
        rowCount={page.total}
        pagination={{ pageIndex: page.page - 1, pageSize: page.pageSize }}
        sorting={sorting}
        onPaginationChange={onPaginationChange}
        onSortingChange={onSortingChange}
        pending={pending}
        toolbar={
          <EmailLogsFilters
            query={query}
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
            noun={t("empty.noun")}
            filteredText={t("empty.filtered")}
            neverText={t("empty.never")}
            onClear={() => navigate(clearEmailLogsFilters(query))}
            onAllTime={() => navigate(withEmailLogsQueryChange(query, { range: "all", from: "", to: "" }))}
            filtered={hasEmailLogsFilters({ ...query, range: "30d", from: "", to: "" })}
          />
        }
        caption={t("caption")}
        itemLabel={t("itemLabel")}
        pageSizeOptions={LOG_PAGE_SIZES}
      />
      <EmailLogDialog
        selectedId={selectedId}
        list={page}
        hrefFor={selection.hrefFor}
        onSelect={selection.select}
        onClose={selection.close}
        onCloseAutoFocus={selection.restoreFocus}
      />
    </>
  );
}
