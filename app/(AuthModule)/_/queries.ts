import "server-only";

import { toServerQuery } from "@/src/lib/auth/builders/adapters";
import { getAccountOperation } from "./operations/settings/account";
import { inspectEmailProofOperation } from "./operations/settings/emailProof";
import { getProfileOperation } from "./operations/settings/profile";
import { listSessionsOperation } from "./operations/settings/sessions";

/**
 * SSR wiring for the settings pages and the public confirmation page: the
 * trusted `server-render` entry point around the read definitions. Pages
 * import these; they never call a browser Server Action or a service.
 */
export const getProfileQuery = toServerQuery(getProfileOperation);
export const getAccountQuery = toServerQuery(getAccountOperation);
export const listSessionsQuery = toServerQuery(listSessionsOperation);
export const inspectEmailProofQuery = toServerQuery(inspectEmailProofOperation);
