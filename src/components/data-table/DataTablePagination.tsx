"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { lastPage } from "@/src/lib/data-table/queryState";
import type { TablePageState } from "./types";

export const DEFAULT_PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

/** The 1-based rows the page covers, or null for an empty result (never "1–0"). */
export function pageRange(pagination: TablePageState, rowCount: number): { first: number; last: number } | null {
  if (rowCount === 0) return null;
  const first = pagination.pageIndex * pagination.pageSize + 1;
  const last = Math.min(first + pagination.pageSize - 1, rowCount);
  return { first, last };
}

export function DataTablePagination({
  pagination,
  rowCount,
  itemLabel,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  pending = false,
  onPaginationChange,
}: {
  pagination: TablePageState;
  rowCount: number;
  itemLabel: string;
  pageSizeOptions?: readonly number[];
  pending?: boolean;
  onPaginationChange: (next: TablePageState) => void;
}) {
  const t = useTranslations("common.pagination");
  const pageSizeId = useId();
  const range = pageRange(pagination, rowCount);
  const pageCount = lastPage(rowCount, pagination.pageSize);
  const current = pagination.pageIndex + 1;
  const goTo = (pageIndex: number) =>
    onPaginationChange({ pageIndex, pageSize: pagination.pageSize });

  return (
    <div
      data-slot="data-table-pagination"
      className="ui:flex ui:flex-col ui:gap-3 ui:text-sm ui:md:flex-row ui:md:items-center ui:md:justify-between"
    >
      <p role="status" aria-live="polite" className="ui:text-muted-foreground">
        {range ? t("range", { ...range, total: rowCount, itemLabel }) : t("zero", { itemLabel })}
      </p>
      <div className="ui:flex ui:flex-wrap ui:items-center ui:gap-x-6 ui:gap-y-3">
        <div className="ui:flex ui:items-center ui:gap-2">
          <Label htmlFor={pageSizeId} className="ui:whitespace-nowrap ui:font-normal">
            {t("rowsPerPage")}
          </Label>
          <NativeSelect
            id={pageSizeId}
            size="sm"
            value={pagination.pageSize}
            disabled={pending}
            onChange={(event) =>
              onPaginationChange({ pageIndex: 0, pageSize: Number(event.target.value) })
            }
          >
            {pageSizeOptions.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <p className="ui:whitespace-nowrap ui:text-muted-foreground">
          {t("pageOf", { page: current, pages: pageCount })}
        </p>
        <nav aria-label={t("navigation")} className="ui:flex ui:items-center ui:gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("firstPage")}
            disabled={pending || current <= 1}
            onClick={() => goTo(0)}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("previousPage")}
            disabled={pending || current <= 1}
            onClick={() => goTo(pagination.pageIndex - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("nextPage")}
            disabled={pending || current >= pageCount}
            onClick={() => goTo(pagination.pageIndex + 1)}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("lastPage")}
            disabled={pending || current >= pageCount}
            onClick={() => goTo(pageCount - 1)}
          >
            <ChevronsRightIcon />
          </Button>
        </nav>
      </div>
    </div>
  );
}
