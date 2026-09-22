import "server-only";

import { headers } from "next/headers";

import { ActionError, type ActionErrorReason } from "../errors";
import type { Action, ActionMeta } from "./actionBuilder";

/**
 * What a client receives from a server action.
 *
 * Next replaces a thrown error's message with an opaque `digest` in production,
 * so a refusal that throws arrives carrying nothing the UI can act on - and the
 * `TWO_FACTOR_REQUIRED` payload that the step-up modal needs would be lost
 * entirely. Next's own guidance for Server Functions is to model expected
 * errors as return values, which is what this does. Surfaces that have a real
 * status line (below) keep throwing and render a 4xx instead.
 */
export type ActionResult<TOutput> =
  | { ok: true; data: TOutput }
  | { ok: false; reason: ActionErrorReason; status: number; message: string; data?: unknown };

export type ServerAction<TInput, TOutput> = (
  input: TInput,
  meta?: Omit<ActionMeta, "headers">,
) => Promise<ActionResult<TOutput>>;

/**
 * Wraps an action for use from a Client Component. Call the result from a
 * module marked `"use server"`.
 */
export function toServerAction<TInput, TOutput>(
  action: Action<TInput, TOutput>,
): ServerAction<TInput, TOutput> {
  return async (input, meta = {}) => {
    try {
      return { ok: true, data: await action(input, { ...meta, headers: await headers() }) };
    } catch (error) {
      if (!ActionError.is(error)) throw error;

      return {
        ok: false,
        reason: error.reason,
        status: error.status,
        message: error.message,
        ...(error.data === undefined ? {} : { data: error.data }),
      };
    }
  };
}

/**
 * Wraps an action as a route handler. Here a refusal has a status line to live
 * in, so it stays a real 4xx.
 */
export function toRouteHandler<TInput, TOutput>(
  action: Action<TInput, TOutput>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const body = request.method === "GET" ? undefined : await request.json().catch(() => undefined);
      const { stepUp, ...input } = (body ?? {}) as Record<string, unknown> & {
        stepUp?: ActionMeta["stepUp"];
      };

      const data = await action(input as TInput, {
        headers: request.headers,
        ...(stepUp ? { stepUp } : {}),
      });

      return Response.json({ data });
    } catch (error) {
      if (!ActionError.is(error)) throw error;

      return Response.json(
        {
          error: {
            reason: error.reason,
            message: error.message,
            ...(error.data === undefined ? {} : { data: error.data }),
          },
        },
        { status: error.status },
      );
    }
  };
}
