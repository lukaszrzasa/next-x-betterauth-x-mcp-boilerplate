import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { findStaffLogPresence } from "@/app/(LogsModule)/admin/_/db/staff/filterOptions";
import type { StaffLogFilterOptions } from "@/app/(LogsModule)/admin/_/types";

/**
 * What the list's two selects offer: the staff members and actions the log
 * actually contains. It takes no input and there is nothing to interpret,
 * so the facts are the answer. Admin-only on its own, not MCP-eligible, no
 * step-up.
 */
export const listStaffLogFilterOptionsOperation = defineAction({
  name: "logs.staff.filterOptions",
  roles: ["admin"],
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx): Promise<StaffLogFilterOptions> => findStaffLogPresence(ctx),
});
