"use client";

import { Button } from "@/src/components/ui/button";
import { describePeriod, type TimeRangeValue } from "./TimeRangeFilter";

/**
 * What an empty page honestly means: nothing matches the filters (with a way
 * to clear them), nothing in the chosen period (with a way to all time - the
 * default 30 days is itself a period), or nothing recorded at all.
 */
export function EmptyState({
  query,
  pending,
  noun,
  filteredText,
  neverText,
  filtered,
  onClear,
  onAllTime,
}: {
  query: TimeRangeValue;
  pending: boolean;
  /** Plural, e.g. "email attempts". */
  noun: string;
  filteredText: string;
  neverText: string;
  /** Whether any filter other than the period is set. */
  filtered: boolean;
  onClear: () => void;
  onAllTime: () => void;
}) {
  let text = neverText;
  let action: { label: string; run: () => void } | null = null;
  if (filtered) {
    text = filteredText;
    action = { label: "Clear filters", run: onClear };
  } else if (query.range !== "all") {
    text = `No ${noun} were recorded ${describePeriod(query)}.`;
    action = { label: "Show all time", run: onAllTime };
  }

  return (
    <div className="ui:flex ui:flex-col ui:items-center ui:gap-3">
      <p className="ui:text-muted-foreground">{text}</p>
      {action && (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={action.run}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
