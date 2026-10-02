"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { useTranslations } from "next-intl";
import { LogTime } from "@/app/(LogsModule)/admin/_/components/shared/LogTime";
import type { StaffLogItem } from "@/app/(LogsModule)/admin/_/types";
import { StaffLogMessage, StaffLogUser } from "./StaffLogMessage";

type StaffLogsTranslator = ReturnType<typeof useTranslations<"logsAdmin.staffLogs">>;

/** Newest first, always: the log has no other order. */
export function staffLogsColumns(t: StaffLogsTranslator): ColumnDef<StaffLogItem>[] {
  return [
    {
      id: "time",
      enableSorting: false,
      header: t("columns.time"),
      cell: ({ row }) => <LogTime value={row.original.createdAt} className="ui:text-muted-foreground" />,
    },
    {
      id: "staff",
      enableSorting: false,
      header: t("columns.staffMember"),
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
      header: t("columns.action"),
      cell: ({ row }) => <StaffLogMessage blocks={row.original.message} className="ui:block ui:min-w-64 ui:max-w-3xl" />,
    },
  ];
}
