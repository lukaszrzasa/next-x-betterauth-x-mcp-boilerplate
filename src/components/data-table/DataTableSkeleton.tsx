"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";

/**
 * The table's shape while its first page loads: a toolbar line, one header
 * cell per column and a handful of rows. `columnWidths` are Tailwind width
 * classes so the skeleton matches the columns it stands in for.
 */
export function DataTableSkeleton({
  columnWidths,
  rows = 8,
  label: givenLabel,
}: {
  columnWidths: readonly string[];
  rows?: number;
  /** Already translated; defaults to the catalog's "Loading". */
  label?: string;
}) {
  const t = useTranslations("common.pagination");
  const label = givenLabel ?? t("loading");
  return (
    <div role="status" aria-label={label} className="ui:flex ui:flex-col ui:gap-4">
      <div className="ui:flex ui:flex-col ui:gap-3 ui:md:flex-row ui:md:items-end">
        <Skeleton className="ui:h-9 ui:w-full ui:md:max-w-sm" />
        <div className="ui:flex ui:gap-3">
          <Skeleton className="ui:h-9 ui:w-28" />
          <Skeleton className="ui:h-9 ui:w-28" />
          <Skeleton className="ui:h-9 ui:w-28" />
        </div>
      </div>
      <div className="ui:rounded-lg ui:border ui:bg-card">
        <Table>
          <TableHeader>
            <TableRow className="ui:hover:bg-transparent">
              {columnWidths.map((width, index) => (
                <TableHead key={index} scope="col">
                  <Skeleton className={`ui:h-4 ${width}`} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }, (_, rowIndex) => (
              <TableRow key={rowIndex} className="ui:hover:bg-transparent">
                {columnWidths.map((width, index) => (
                  <TableCell key={index}>
                    <Skeleton className={`ui:h-4 ${width}`} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="ui:flex ui:items-center ui:justify-between">
        <Skeleton className="ui:h-4 ui:w-32" />
        <Skeleton className="ui:h-8 ui:w-64" />
      </div>
      <span className="ui:sr-only">{label}…</span>
    </div>
  );
}
