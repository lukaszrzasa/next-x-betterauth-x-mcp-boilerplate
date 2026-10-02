"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTableToolbar } from "@/src/components/data-table/DataTableToolbar";
import { Button } from "@/src/components/ui/button";
import {
  clearStaffLogsFilters,
  hasStaffLogsFilters,
  withStaffLogsQueryChange,
} from "@/app/(LogsModule)/admin/_/queryState";
import type { StaffLogFilterOptions, StaffLogsQuery } from "@/app/(LogsModule)/admin/_/types";
import { FilterSelect } from "@/app/(LogsModule)/admin/_/components/shared/FilterSelect";
import { LogSearchField } from "@/app/(LogsModule)/admin/_/components/shared/LogSearchField";
import { TimeRangeFilter } from "@/app/(LogsModule)/admin/_/components/shared/TimeRangeFilter";

export type StaffLogsFiltersProps = {
  query: StaffLogsQuery;
  options: StaffLogFilterOptions;
  pending: boolean;
  onChange: (next: StaffLogsQuery) => void;
  onSearchChange: (next: StaffLogsQuery) => void;
  onSearchSubmit: () => void;
};

/** A value the URL carries stays selectable even when the log no longer offers it. */
function withCurrent(options: { value: string; label: string }[], current: string) {
  return current === "" || options.some((option) => option.value === current)
    ? options
    : [...options, { value: current, label: current }];
}

/**
 * The list's filters: what the message says, when, who acted and what they
 * did. The two selects offer only staff members and actions the log
 * contains.
 */
export function StaffLogsFilters({
  query,
  options,
  pending,
  onChange,
  onSearchChange,
  onSearchSubmit,
}: StaffLogsFiltersProps) {
  const t = useTranslations("logsAdmin.staffLogs");
  const tActions = useTranslations("common.actions");
  const change = (next: Partial<Omit<StaffLogsQuery, "page">>) => onChange(withStaffLogsQueryChange(query, next));
  const action = query.actions[0] ?? "";
  const actors = withCurrent(
    options.actors.map((actor) => ({ value: actor.id, label: actor.name })),
    query.actorId,
  );
  const actions = withCurrent(
    options.actions.map((key) => ({ value: key, label: key })),
    action,
  );

  return (
    <DataTableToolbar
      search={
        <LogSearchField
          label={t("search.label")}
          placeholder={t("search.placeholder")}
          value={query.q}
          onChange={(q) => onSearchChange(withStaffLogsQueryChange(query, { q }))}
          onSubmit={onSearchSubmit}
        />
      }
      filters={
        <>
          <TimeRangeFilter
            value={{ range: query.range, from: query.from, to: query.to }}
            pending={pending}
            onChange={(range) => change(range)}
          />
          <FilterSelect
            label={t("filters.staffMember")}
            value={query.actorId}
            options={[{ value: "", label: t("filters.anyone") }, ...actors]}
            pending={pending}
            onChange={(actorId) => change({ actorId })}
          />
          <FilterSelect
            label={t("filters.action")}
            value={action}
            options={[{ value: "", label: t("filters.anyAction") }, ...actions]}
            pending={pending}
            onChange={(next) => change({ actions: next ? [next] : [] })}
          />
        </>
      }
      actions={
        hasStaffLogsFilters(query) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onChange(clearStaffLogsFilters(query))}
          >
            <XIcon aria-hidden="true" />
            {tActions("clearFilters")}
          </Button>
        ) : undefined
      }
    />
  );
}
