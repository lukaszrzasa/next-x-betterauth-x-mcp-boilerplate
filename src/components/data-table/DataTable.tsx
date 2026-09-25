"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { cn } from "@/src/lib/utils";
import { DataTablePagination } from "./DataTablePagination";
import type { DataTableProps, TableSort } from "./types";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

function resolve<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(previous) : updater;
}

/**
 * Controlled TanStack table over one server page. Pagination, sorting and
 * filtering are all manual: the table reports intent and renders whatever
 * rows it is handed next. A single sort with a two-state toggle; removal is
 * disabled so the list always has an order.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  rowCount,
  pagination,
  sorting,
  onPaginationChange,
  onSortingChange,
  pending = false,
  toolbar,
  emptyState,
  caption,
  itemLabel,
  pageSizeOptions,
}: DataTableProps<T>) {
  // TanStack Table returns functions the React Compiler cannot memoize safely;
  // the directive opts this component out, which is the library's guidance.
  "use no memo";
  const sortingState: SortingState = sorting ? [sorting] : [];
  // eslint-disable-next-line react-hooks/incompatible-library -- handled by "use no memo" above
  const table = useReactTable({
    data,
    columns,
    getRowId,
    rowCount,
    state: { pagination, sorting: sortingState },
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    onPaginationChange: (updater) => onPaginationChange(resolve(updater, pagination)),
    onSortingChange: (updater) => {
      const [next] = resolve(updater, sortingState);
      onSortingChange((next ?? null) as TableSort);
    },
    getCoreRowModel: getCoreRowModel(),
  });
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  return (
    <div
      data-slot="data-table"
      aria-busy={pending || undefined}
      className={cn("ui:flex ui:flex-col ui:gap-4", pending && "ui:opacity-70 ui:transition-opacity")}
    >
      {toolbar}
      <div className="ui:rounded-lg ui:border ui:bg-card">
        <Table>
          <TableCaption className="ui:sr-only">{caption}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="ui:hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} scope="col" aria-sort={sorted ? ARIA_SORT[sorted] : undefined}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="ui:hover:bg-transparent">
                <TableCell colSpan={columnCount} className="ui:h-32 ui:text-center ui:whitespace-normal">
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        pagination={pagination}
        rowCount={rowCount}
        itemLabel={itemLabel}
        pageSizeOptions={pageSizeOptions}
        pending={pending}
        onPaginationChange={onPaginationChange}
      />
    </div>
  );
}
