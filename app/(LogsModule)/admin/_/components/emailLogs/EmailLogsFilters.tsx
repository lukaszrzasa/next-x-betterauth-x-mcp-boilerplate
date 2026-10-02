"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { DataTableToolbar } from "@/src/components/data-table/DataTableToolbar";
import { Button } from "@/src/components/ui/button";
import { opaqueIdSchema } from "@/app/(LogsModule)/_/schema";
import { EMAIL_LOG_STATUSES } from "@/app/(LogsModule)/_/types";
import {
  clearEmailLogsFilters,
  hasEmailLogsFilters,
  withEmailLogsQueryChange,
} from "@/app/(LogsModule)/admin/_/queryState";
import type { EmailLogSort, EmailStatusFilter, SortDirection } from "@/app/(LogsModule)/admin/_/schema";
import type { EmailLogsQuery } from "@/app/(LogsModule)/admin/_/types";
import { ExactFilterInput } from "@/app/(LogsModule)/admin/_/components/shared/ExactFilterInput";
import { FilterSelect } from "@/app/(LogsModule)/admin/_/components/shared/FilterSelect";
import { LogSearchField } from "@/app/(LogsModule)/admin/_/components/shared/LogSearchField";
import { TimeRangeFilter } from "@/app/(LogsModule)/admin/_/components/shared/TimeRangeFilter";

const recipientSchema = z.email().max(254);

/** One value per sort/direction pair; the column headers offer the same sorts. */
const SORT_VALUES = [
  ["time:desc", "timeDesc"],
  ["time:asc", "timeAsc"],
  ["recipient:asc", "recipientAsc"],
  ["recipient:desc", "recipientDesc"],
  ["subject:asc", "subjectAsc"],
  ["subject:desc", "subjectDesc"],
] as const satisfies ReadonlyArray<readonly [`${EmailLogSort}:${SortDirection}`, string]>;

export type EmailLogsFiltersProps = {
  query: EmailLogsQuery;
  pending: boolean;
  /** Deliberate filters, sort and clear: pushed immediately. */
  onChange: (next: EmailLogsQuery) => void;
  /** Search text: debounced by the caller. */
  onSearchChange: (next: EmailLogsQuery) => void;
  onSearchSubmit: () => void;
};

export function EmailLogsFilters({ query, pending, onChange, onSearchChange, onSearchSubmit }: EmailLogsFiltersProps) {
  const t = useTranslations("logsAdmin.emailLogs");
  const tActions = useTranslations("common.actions");
  const statusOptions: { value: EmailStatusFilter; label: string }[] = [
    { value: "all", label: t("filters.anyStatus") },
    ...EMAIL_LOG_STATUSES.map((status) => ({ value: status, label: t(`status.${status}.label`) })),
  ];
  const sortOptions = SORT_VALUES.map(([value, key]) => ({ value, label: t(`filters.sort.${key}`) }));
  const change = (next: Partial<Omit<EmailLogsQuery, "page">>) => onChange(withEmailLogsQueryChange(query, next));
  const advanced = query.recipient !== "" || query.userId !== "";

  return (
    <div className="ui:flex ui:flex-col ui:gap-3">
      <DataTableToolbar
        search={
          <LogSearchField
            label={t("search.label")}
            placeholder={t("search.placeholder")}
            value={query.q}
            onChange={(q) => onSearchChange(withEmailLogsQueryChange(query, { q }))}
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
              label={t("filters.status")}
              value={query.status}
              options={statusOptions}
              pending={pending}
              onChange={(status) => change({ status })}
            />
            <FilterSelect
              label={t("filters.sortBy")}
              value={`${query.sort}:${query.direction}` as const}
              options={sortOptions}
              pending={pending}
              onChange={(value) => {
                const [sort, direction] = value.split(":") as [EmailLogSort, SortDirection];
                change({ sort, direction });
              }}
            />
          </>
        }
        actions={
          hasEmailLogsFilters(query) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => onChange(clearEmailLogsFilters(query))}
            >
              <XIcon aria-hidden="true" />
              {tActions("clearFilters")}
            </Button>
          ) : undefined
        }
      />
      <details open={advanced || undefined} className="ui:group">
        <summary className="ui:w-fit ui:cursor-pointer ui:text-sm ui:text-muted-foreground ui:select-none ui:hover:text-foreground">
          {t("filters.recipientFilters")}
        </summary>
        <div className="ui:mt-3 ui:flex ui:flex-wrap ui:items-end ui:gap-3">
          <ExactFilterInput
            label={t("filters.recipientEmail")}
            type="email"
            value={query.recipient}
            placeholder={t("filters.recipientEmailPlaceholder")}
            maxLength={254}
            pending={pending}
            schema={recipientSchema}
            invalidMessage={t("filters.recipientEmailInvalid")}
            onApply={(recipient) => change({ recipient: recipient.toLowerCase() })}
          />
          <ExactFilterInput
            label={t("filters.recipientUserId")}
            value={query.userId}
            placeholder={t("filters.recipientUserIdPlaceholder")}
            maxLength={128}
            pending={pending}
            schema={opaqueIdSchema}
            invalidMessage={t("filters.recipientUserIdInvalid")}
            onApply={(userId) => change({ userId })}
          />
        </div>
      </details>
    </div>
  );
}
