import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/**
 * Responsive slots above a table: search stretches, filters wrap beside it
 * and actions sit at the end. It lays out what it is given; the list owns
 * which controls exist.
 */
export function DataTableToolbar({
  search,
  filters,
  actions,
  className,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="data-table-toolbar"
      className={cn("ui:flex ui:flex-col ui:gap-3 ui:md:flex-row ui:md:flex-wrap ui:md:items-end", className)}
    >
      {search && <div className="ui:min-w-0 ui:flex-1 ui:md:max-w-sm">{search}</div>}
      {filters && (
        <div className="ui:flex ui:flex-wrap ui:items-end ui:gap-3">{filters}</div>
      )}
      {actions && (
        <div className="ui:flex ui:flex-wrap ui:items-center ui:gap-2 ui:md:ml-auto">{actions}</div>
      )}
    </div>
  );
}
