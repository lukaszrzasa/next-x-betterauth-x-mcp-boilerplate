import "server-only";

import { headers } from "next/headers";

import type { Action } from "@/src/lib/auth/builders/actionTypes";

/**
 * The trusted SSR read path. A page calls the returned function while
 * rendering; the adapter reads the current request's headers itself and runs
 * the operation with `entryPoint: "server-render"`, so the definition still
 * performs its session, enrollment, permission and provenance checks.
 *
 * Deliberately narrow: no caller metadata, no step-up argument, no result
 * envelope. Errors propagate as the typed `ActionError` (or a Next control-flow
 * exception) for the page to translate into a redirect, not-found or error
 * boundary. It is not a `"use server"` export and never becomes an HTTP
 * endpoint; use it for reads only, mutations go through `toServerAction`.
 */
export function toServerQuery<TInput, TOutput>(
  action: Action<TInput, TOutput>,
): (input: TInput) => Promise<TOutput> {
  return async (input) =>
    action(input, {
      headers: await headers(),
      entryPoint: "server-render",
    });
}
