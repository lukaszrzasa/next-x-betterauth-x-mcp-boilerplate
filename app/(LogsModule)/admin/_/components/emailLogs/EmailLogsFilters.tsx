"use client";

import { XIcon } from "lucide-react";
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
import { EMAIL_STATUS_PRESENTATION } from "./EmailStatusBadge";

const STATUS_OPTIONS: { value: EmailStatusFilter; label: string }[] = [
  { value: "all", label: "Any status" },
  ...EMAIL_LOG_STATUSES.map((status) => ({ value: status, label: EMAIL_STATUS_PRESENTATION[status].label })),
];

const recipientSchema = z.email().max(254);

/** One value per sort/direction pair; the column headers offer the same sorts. */
const SORT_OPTIONS: { value: `${EmailLogSort}:${SortDirection}`; label: string }[] = [
  { value: "time:desc", label: "Newest first" },
  { value: "time:asc", label: "Oldest first" },
  { value: "recipient:asc", label: "Recipient A–Z" },
  { value: "recipient:desc", label: "Recipient Z–A" },
  { value: "subject:asc", label: "Subject A–Z" },
  { value: "subject:desc", label: "Subject Z–A" },
];

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
  const change = (next: Partial<Omit<EmailLogsQuery, "page">>) => onChange(withEmailLogsQueryChange(query, next));
  const advanced = query.recipient !== "" || query.userId !== "";

  return (
    <div className="ui:flex ui:flex-col ui:gap-3">
      <DataTableToolbar
        search={
          <LogSearchField
            label="Search email logs"
            placeholder="Search subject or recipient"
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
              label="Status"
              value={query.status}
              options={STATUS_OPTIONS}
              pending={pending}
              onChange={(status) => change({ status })}
            />
            <FilterSelect
              label="Sort by"
              value={`${query.sort}:${query.direction}` as const}
              options={SORT_OPTIONS}
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
              Clear filters
            </Button>
          ) : undefined
        }
      />
      <details open={advanced || undefined} className="ui:group">
        <summary className="ui:w-fit ui:cursor-pointer ui:text-sm ui:text-muted-foreground ui:select-none ui:hover:text-foreground">
          Recipient filters
        </summary>
        <div className="ui:mt-3 ui:flex ui:flex-wrap ui:items-end ui:gap-3">
          <ExactFilterInput
            label="Recipient email (exact)"
            type="email"
            value={query.recipient}
            placeholder="name@example.com"
            maxLength={254}
            pending={pending}
            schema={recipientSchema}
            invalidMessage="Enter a complete email address."
            onApply={(recipient) => change({ recipient: recipient.toLowerCase() })}
          />
          <ExactFilterInput
            label="Recipient user ID (exact)"
            value={query.userId}
            placeholder="User ID"
            maxLength={128}
            pending={pending}
            schema={opaqueIdSchema}
            invalidMessage="Enter an ID of at most 128 characters without control characters."
            onApply={(userId) => change({ userId })}
          />
        </div>
      </details>
    </div>
  );
}
