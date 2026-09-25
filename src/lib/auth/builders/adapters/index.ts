/**
 * The only import path for adapters and their wire types. Sibling files import
 * each other relatively; everything outside this folder imports from here.
 */
export { toServerAction } from "./serverAction";
export { toRouteHandler } from "./routeHandler";
export { assertMcpEligible } from "./mcpPolicy";

export type { ActionResult, ClientActionMeta, ServerAction } from "./types";
