"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { LogTime } from "@/app/(LogsModule)/admin/_/components/shared/LogTime";
import type { StaffLogItem } from "@/app/(LogsModule)/admin/_/types";
import { StaffLogMessage, StaffLogUser } from "./StaffLogMessage";

/** Newest first, always: the log has no other order. */
export const staffLogsColumns: ColumnDef<StaffLogItem>[] = [
  {
    id: "time",
    enableSorting: false,
    header: "Time",
    cell: ({ row }) => <LogTime value={row.original.createdAt} className="ui:text-muted-foreground" />,
  },
  {
    id: "staff",
    enableSorting: false,
    header: "Staff member",
    cell: ({ row }) => (
      <StaffLogUser
        id={row.original.actor.id}
        label={row.original.actor.name}
        className="ui:block ui:max-w-44 ui:truncate"
      />
    ),
  },
  {
    id: "action",
    enableSorting: false,
    header: "Action",
    cell: ({ row }) => <StaffLogMessage blocks={row.original.message} className="ui:block ui:min-w-64 ui:max-w-3xl" />,
  },
];
