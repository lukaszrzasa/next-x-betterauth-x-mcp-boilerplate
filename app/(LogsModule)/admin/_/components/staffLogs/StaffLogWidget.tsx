"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DataTablePagination } from "@/src/components/data-table/DataTablePagination";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { SEARCH_DEBOUNCE_MS } from "@/src/lib/data-table/useTableNavigation";
import { cn } from "@/src/lib/utils";
import { useViewer } from "@/src/components/shell/ViewerProvider";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";
import { useStaffLogs, type StaffLogsState } from "@/app/(LogsModule)/admin/_/hooks/useStaffLogs";
import { STAFF_LOGS_QUERY_DEFAULTS } from "@/app/(LogsModule)/admin/_/queryState";
import type { LogPageSize } from "@/app/(LogsModule)/admin/_/schema";
import type { StaffLogsQuery } from "@/app/(LogsModule)/admin/_/types";
import { LogSearchField } from "@/app/(LogsModule)/admin/_/components/shared/LogSearchField";
import { LogTime } from "@/app/(LogsModule)/admin/_/components/shared/LogTime";
import { StaffLogMessage, StaffLogUser } from "./StaffLogMessage";

const WIDGET_PAGE_SIZES: readonly LogPageSize[] = [10, 25];

export type StaffLogWidgetProps = {
  /** Everything done to this resource; the ID alone identifies it. */
  resourceId?: string;
  /** Everything this staff member did. */
  actorId?: string;
  /** Only this action, or any of these. */
  action?: string | readonly string[];
  /** Changes when the host knows the log may have grown; the widget reads again. */
  revision?: unknown;
  /** Names the list for assistive technology, e.g. "Staff actions on this user". */
  label?: string;
  className?: string;
};

/** Whether the viewer may read the staff log; a host uses it to leave out the widget's surroundings. */
export function useCanViewStaffLog(): boolean {
  return useViewer().can(logsRoutes.staffLogs.access);
}

/**
 * The staff log embedded in another module's page: the entries matching the
 * props, with its own search and pagination. Its state lives in the
 * component, never in the URL, so it cannot collide with the page around it
 * or with a second widget beside it.
 *
 * Renders nothing, and reads nothing, for a viewer who may not open the
 * staff log; the read refuses them on its own as well.
 */
export function StaffLogWidget(props: StaffLogWidgetProps) {
  return useCanViewStaffLog() ? <StaffLogWidgetContent {...props} /> : null;
}

function StaffLogWidgetContent({
  resourceId = "",
  actorId = "",
  action,
  revision,
  label = "Staff actions",
  className,
}: StaffLogWidgetProps) {
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<LogPageSize>(WIDGET_PAGE_SIZES[0]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const actions = typeof action === "string" ? action : (action ?? []).join("\n");
  const query = useMemo<StaffLogsQuery>(
    () => ({
      ...STAFF_LOGS_QUERY_DEFAULTS,
      range: "all",
      q: appliedQ,
      actorId,
      resourceId,
      actions: actions ? actions.split("\n") : [],
      page,
      pageSize,
    }),
    [actions, actorId, appliedQ, page, pageSize, resourceId],
  );
  const state = useStaffLogs(query, revision);

  const applySearch = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAppliedQ(next);
    setPage(1);
  };
  const onSearchChange = (next: string) => {
    setQ(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => applySearch(next), SEARCH_DEBOUNCE_MS);
  };

  if (state.status === "refused") return null;

  const shown = state.status === "failed" ? null : state.page;
  const loading = state.status === "loading";

  return (
    <div className={cn("ui:flex ui:flex-col ui:gap-4", className)} aria-busy={loading || undefined}>
      <LogSearchField
        label={`Search ${label.toLowerCase()}`}
        placeholder="Search what was done"
        value={q}
        onChange={onSearchChange}
        onSubmit={() => applySearch(q)}
      />

      <Entries
        state={state}
        label={label}
        emptyText={appliedQ ? "No staff actions match this search." : "No staff actions have been logged here."}
      />

      {shown !== null && shown.total > 0 && (
        <DataTablePagination
          pagination={{ pageIndex: shown.page - 1, pageSize: shown.pageSize }}
          rowCount={shown.total}
          itemLabel="staff actions"
          pageSizeOptions={WIDGET_PAGE_SIZES}
          pending={loading}
          onPaginationChange={(next) => {
            const size = WIDGET_PAGE_SIZES.find((option) => option === next.pageSize) ?? pageSize;
            setPageSize(size);
            setPage(size === pageSize ? next.pageIndex + 1 : 1);
          }}
        />
      )}
    </div>
  );
}

function Entries({ state, label, emptyText }: { state: StaffLogsState; label: string; emptyText: string }) {
  if (state.status === "refused") return null;
  if (state.status === "failed") {
    return (
      <div role="alert" className="ui:flex ui:flex-col ui:items-start ui:gap-2 ui:text-sm">
        <p className="ui:text-muted-foreground">The staff log could not be loaded.</p>
        <Button type="button" variant="outline" size="sm" onClick={state.retry}>
          Retry
        </Button>
      </div>
    );
  }
  if (state.page === null) {
    return (
      <div className="ui:flex ui:flex-col ui:gap-3" role="status" aria-label="Loading the staff log">
        <Skeleton className="ui:h-10 ui:w-full" />
        <Skeleton className="ui:h-10 ui:w-full" />
        <Skeleton className="ui:h-10 ui:w-2/3" />
      </div>
    );
  }
  if (state.page.items.length === 0) return <p className="ui:text-sm ui:text-muted-foreground">{emptyText}</p>;

  return (
    <ul
      aria-label={label}
      className={cn("ui:flex ui:flex-col ui:divide-y", state.status === "loading" && "ui:opacity-70")}
    >
      {state.page.items.map((entry) => (
        <li key={entry.id} className="ui:flex ui:flex-col ui:gap-1 ui:py-3 ui:text-sm ui:first:pt-0 ui:last:pb-0">
          <p className="ui:min-w-0">
            <StaffLogUser id={entry.actor.id} label={entry.actor.name} />
            <span className="ui:text-muted-foreground">: </span>
            <StaffLogMessage blocks={entry.message} />
          </p>
          <LogTime value={entry.createdAt} className="ui:text-xs ui:text-muted-foreground" />
        </li>
      ))}
    </ul>
  );
}
