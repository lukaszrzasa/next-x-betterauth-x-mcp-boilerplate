import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { ActionError } from "@/src/lib/auth/errors";
import { getEmailLogDetail, listEmailLogs } from "@/app/(LogsModule)/admin/_/db/emailLogQueryService";
import { listStaffLogFilterOptions, listStaffLogs } from "@/app/(LogsModule)/admin/_/db/staffLogQueryService";
import {
  emailLogDetailSchema,
  emailLogsQuerySchema,
  staffLogsQuerySchema,
} from "@/app/(LogsModule)/admin/_/schema";

/**
 * The log reads. Each is independently admin-only: page access
 * (`logsRoutes.*`) is necessary but not sufficient, and a read exposed as a
 * Server Action (the email dialog, the staff log widget) is one a browser
 * can call directly, so it checks again. `roles`
 * goes through the shared role parser (a composite role containing `admin`
 * passes; moderator or user alone is answered NOT_FOUND, as if the read did
 * not exist). No permission names are involved. None is MCP-eligible and
 * none requires step-up; the builder's session and enrollment checks apply.
 *
 * Viewing a log records nothing.
 */

const ADMIN_ONLY = ["admin"] as const;

/** A record that does not exist, and one hidden from the caller, are the same answer. */
function notAvailable(): never {
  throw new ActionError("NOT_FOUND", { message: "This log is not available." });
}

export const listEmailLogsOperation = defineAction({
  name: "logs.email.list",
  schema: emailLogsQuerySchema,
  roles: ADMIN_ONLY,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => listEmailLogs(ctx, input),
});

export const getEmailLogOperation = defineAction({
  name: "logs.email.get",
  schema: emailLogDetailSchema,
  roles: ADMIN_ONLY,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input) => (await getEmailLogDetail(ctx, input)) ?? notAvailable(),
});

/** Serves the list page and every embedded widget: the same read, the same rule. */
export const listStaffLogsOperation = defineAction({
  name: "logs.staff.list",
  schema: staffLogsQuerySchema,
  roles: ADMIN_ONLY,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => listStaffLogs(ctx, input),
});

export const listStaffLogFilterOptionsOperation = defineAction({
  name: "logs.staff.filterOptions",
  roles: ADMIN_ONLY,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => listStaffLogFilterOptions(ctx),
});
