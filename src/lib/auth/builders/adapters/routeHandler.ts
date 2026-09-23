import "server-only";

import { ActionError } from "../../errors";
import { optionalData } from "./response";

import type { Action, ActionMeta } from "../actionTypes";

/** JSON objects reserve the top-level stepUp field for request metadata. */
export function toRouteHandler<TInput, TOutput>(
  action: Action<TInput, TOutput>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      checkOrigin(request);
      const { input, stepUp } = await readRequest(request);

      const data = await action(input as TInput, {
        headers: request.headers,
        entryPoint: "route-handler",
        ...(stepUp === undefined ? {} : { stepUp }),
      });

      return Response.json({ data });
    } catch (error) {
      if (!ActionError.is(error)) {
        throw error;
      }

      return Response.json(
        {
          error: {
            reason: error.reason,
            message: error.message,
            ...optionalData(error.data),
          },
        },
        {
          status: error.status,
        },
      );
    }
  };
}

/** Unsafe cookie-authenticated requests must come from this exact origin. */
function checkOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;

  // Do not trust forwarded host headers or accept missing/opaque origins.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new ActionError("FORBIDDEN", {
      message: "Request origin is not allowed.",
    });
  }
}

async function readRequest(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return {
      input: undefined,
      stepUp: undefined,
    };
  }

  const text = await request.text();
  if (text.length === 0) return { input: undefined, stepUp: undefined };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ActionError("INVALID_INPUT", {
      message: "Request body must be valid JSON.",
    });
  }

  // Preserve arrays, primitives and null for the action's schema to validate.
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { input: body, stepUp: undefined };
  }

  const { stepUp, ...input } = body as RequestBody;

  return {
    input,
    stepUp,
  };
}

type RequestBody = Record<string, unknown> & {
  stepUp?: ActionMeta["stepUp"];
};
