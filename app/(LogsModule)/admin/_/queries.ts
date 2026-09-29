import "server-only";

import { toServerQuery } from "@/src/lib/auth/builders/adapters";
import {
  listEmailLogsOperation,
  listStaffLogFilterOptionsOperation,
  listStaffLogsOperation,
} from "./operations/logQueries";

/**
 * SSR wiring for the list pages: the trusted `server-render` entry point
 * around the list definitions. Reads that load on demand in the browser are
 * in `actions.ts`.
 */
export const listEmailLogsQuery = toServerQuery(listEmailLogsOperation);
export const listStaffLogsQuery = toServerQuery(listStaffLogsOperation);
export const listStaffLogFilterOptionsQuery = toServerQuery(listStaffLogFilterOptionsOperation);
