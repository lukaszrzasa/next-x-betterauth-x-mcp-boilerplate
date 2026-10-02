"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

const SORT_ICONS = {
  asc: ArrowUpIcon,
  desc: ArrowDownIcon,
  none: ChevronsUpDownIcon,
} as const;

/**
 * A sortable column's header: a real button, labelled with what it does,
 * toggling between ascending and descending. The `aria-sort` attribute is
 * set on the surrounding `<th>` by the table.
 */
export function DataTableColumnHeader<T, V>({
  column,
  title,
  className,
}: {
  column: Column<T, V>;
  title: string;
  className?: string;
}) {
  const t = useTranslations("common.pagination");
  if (!column.getCanSort()) {
    return <span className={cn("ui:font-medium", className)}>{title}</span>;
  }

  const sorted = column.getIsSorted();
  const next = t(sorted === "asc" ? "descending" : "ascending");
  const Icon = SORT_ICONS[sorted || "none"];

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("ui:-ml-2 ui:h-8 ui:gap-1.5 ui:font-medium ui:data-[sorted=true]:text-foreground", className)}
      data-sorted={sorted !== false}
      aria-label={t("sortBy", { title, direction: next })}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {title}
      <Icon aria-hidden="true" className={cn("ui:size-3.5", sorted === false && "ui:text-muted-foreground")} />
    </Button>
  );
}
