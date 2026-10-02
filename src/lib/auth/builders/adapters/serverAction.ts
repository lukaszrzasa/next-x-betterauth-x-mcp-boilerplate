import "server-only";

import { headers } from "next/headers";

import { ActionError } from "@/src/lib/auth/errors";
import { requestLocale } from "@/src/lib/i18n/resolveLocale";
import { localizeActionError } from "./localize";
import { optionalData } from "./response";

import type { Action } from "@/src/lib/auth/builders/actionTypes";

import type { ServerAction } from "./types";

/** Call the returned function from an exported async function in a "use server" file. */
export function toServerAction<TInput, TOutput>(
  action: Action<TInput, TOutput>,
): ServerAction<TInput, TOutput> {
  return async (input, meta = {}) => {
    const requestHeaders = await headers();
    try {

      const data = await action(input, {
        stepUp: meta.stepUp,
        entryPoint: "server-action",
        headers: requestHeaders,
      });

      return {
        ok: true,
        data,
      };
    } catch (error) {
      if (!ActionError.is(error)) {
        throw error;
      }

      return {
        ok: false,
        reason: error.reason,
        status: error.status,
        message: localizeActionError(error, requestLocale(requestHeaders)),
        ...optionalData(error.data),
      };
    }
  };
}
