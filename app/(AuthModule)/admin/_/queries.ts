import "server-only";

import { toServerQuery } from "@/src/lib/auth/builders/adapters";
import { getUserOperation, listUsersOperation } from "./operations/usersQueries";

/**
 * SSR wiring for the pages: the trusted `server-render` entry point around
 * the two read definitions. Pages import these; they never call a browser
 * Server Action or a service directly.
 */
export const listUsersQuery = toServerQuery(listUsersOperation);
export const getUserQuery = toServerQuery(getUserOperation);
