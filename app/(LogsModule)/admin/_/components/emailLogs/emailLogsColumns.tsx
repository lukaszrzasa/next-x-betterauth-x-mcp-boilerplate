"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/src/components/data-table/DataTableColumnHeader";
import { Button } from "@/src/components/ui/button";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { EntityLabel } from "@/app/(LogsModule)/admin/_/components/shared/EntityLabel";
import { LogTime } from "@/app/(LogsModule)/admin/_/components/shared/LogTime";
import type { EmailLogListItem } from "@/app/(LogsModule)/admin/_/types";
import { EmailStatusBadge } from "./EmailStatusBadge";

/** Column IDs double as the sort vocabulary the list maps onto the query. */
export const EMAIL_LOGS_COLUMN_IDS = {
  time: "time",
  recipient: "recipient",
  subject: "subject",
  status: "status",
  attempt: "attempt",
  actions: "actions",
} as const;

export type EmailLogsColumnsOptions = {
  /** Opens the dialog; the button is passed so focus can return to it. */
  onOpen: (id: string, from: HTMLElement) => void;
};

/** The recipient as captured: name (linked to the user when allowed) over the address. */
function Recipient({ log }: { log: EmailLogListItem }) {
  const primary = log.recipientLabel ?? log.recipientEmail;
  return (
    <div className="ui:flex ui:max-w-xs ui:min-w-0 ui:flex-col">
      {log.recipientUserId ? (
        <EntityLabel entity={{ type: "user", id: log.recipientUserId, label: primary }} className="ui:truncate" />
      ) : (
        <span className="ui:truncate ui:font-medium">{primary}</span>
      )}
      {log.recipientLabel && (
        <span className="ui:truncate ui:text-xs ui:text-muted-foreground">{log.recipientEmail}</span>
      )}
    </div>
  );
}

export function emailLogsColumns({ onOpen }: EmailLogsColumnsOptions): ColumnDef<EmailLogListItem>[] {
  return [
    {
      id: EMAIL_LOGS_COLUMN_IDS.time,
      accessorKey: "startedAt",
      enableSorting: true,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />,
      cell: ({ row }) => <LogTime value={row.original.startedAt} className="ui:text-muted-foreground" />,
    },
    {
      id: EMAIL_LOGS_COLUMN_IDS.recipient,
      accessorKey: "recipientEmail",
      enableSorting: true,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Recipient" />,
      cell: ({ row }) => <Recipient log={row.original} />,
    },
    {
      id: EMAIL_LOGS_COLUMN_IDS.subject,
      accessorKey: "subject",
      enableSorting: true,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subject" />,
      cell: ({ row }) => (
        <span className="ui:block ui:max-w-sm ui:truncate" title={row.original.subject}>
          {row.original.subject}
        </span>
      ),
    },
    {
      id: EMAIL_LOGS_COLUMN_IDS.status,
      enableSorting: false,
      header: "Status",
      cell: ({ row }) => <EmailStatusBadge status={row.original.status} />,
    },
    {
      id: EMAIL_LOGS_COLUMN_IDS.attempt,
      enableSorting: false,
      header: "Attempt",
      cell: ({ row }) =>
        row.original.attemptNumber === 1 ? (
          <span className="ui:text-muted-foreground">Initial</span>
        ) : (
          <span>
            <span aria-hidden="true">#{row.original.attemptNumber}</span>
            <span className="ui:sr-only">Attempt {row.original.attemptNumber}</span>
          </span>
        ),
    },
    {
      id: EMAIL_LOGS_COLUMN_IDS.actions,
      enableSorting: false,
      header: () => <span className="ui:sr-only">Actions</span>,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ui:text-muted-foreground"
          aria-label={`View details of the email to ${row.original.recipientEmail}, ${formatUtcDateTime(row.original.startedAt)}`}
          onClick={(event) => onOpen(row.original.id, event.currentTarget)}
        >
          View details
        </Button>
      ),
    },
  ];
}
