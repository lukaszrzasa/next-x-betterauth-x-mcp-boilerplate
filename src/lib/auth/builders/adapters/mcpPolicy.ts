import "server-only";

import type { Action } from "../actionTypes";

/** Call before registering a selected definition as an MCP tool. */
export function assertMcpEligible<TInput, TOutput>(action: Action<TInput, TOutput>): void {
  if (action.mcpAllowed !== true) {
    throw new Error("Operations without explicit MCP permission cannot be registered as MCP tools.");
  }
}
