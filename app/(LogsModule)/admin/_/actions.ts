"use server";

import { toServerAction } from "@/src/lib/auth/builders/adapters";
import { getEmailLogOperation } from "./operations/email/getEmailLog";
import { listStaffLogsOperation } from "./operations/staff/listStaffLogs";

/**
 * Reads that load on demand in the browser: the email record behind
 * `?log=<id>` and the pages of an embedded staff log widget. Reads only -
 * nothing here records, sends or changes anything - and each re-checks admin
 * access itself.
 */
export const getEmailLogAction = toServerAction(getEmailLogOperation);
export const listStaffLogsAction = toServerAction(listStaffLogsOperation);
