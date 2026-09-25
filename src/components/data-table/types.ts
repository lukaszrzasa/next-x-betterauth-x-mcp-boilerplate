import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

/** 0-based inside the table adapter only; URL and service state stay 1-based. */
export type TablePageState = { pageIndex: number; pageSize: number };

/** A single active sort, or none. The list wrapper guarantees it always has one. */
export type TableSort = { id: string; desc: boolean } | null;

/**
 * A server-driven table: the page of rows it receives is the page it shows.
 * No client filtering, sorting or pagination is applied to that page; every
 * change is reported through the callbacks and the caller fetches again.
 */
export type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  rowCount: number;
  pagination: TablePageState;
  sorting: TableSort;
  onPaginationChange: (next: TablePageState) => void;
  onSortingChange: (next: TableSort) => void;
  /** A navigation is in flight: rows stay visible, subdued, and controls pause. */
  pending?: boolean;
  toolbar?: ReactNode;
  emptyState: ReactNode;
  /** Announced to assistive technology; not shown visually. */
  caption: string;
  /** Plural display label, e.g. "users", for the result range and row count. */
  itemLabel: string;
  pageSizeOptions?: readonly number[];
};
