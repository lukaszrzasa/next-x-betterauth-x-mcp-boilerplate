import type { ZodType } from "zod";

import { ActionError } from "@/src/lib/auth/errors";

export async function parseInput<TInput>(
  schema: ZodType<TInput> | undefined,
  rawInput: unknown,
): Promise<TInput> {
  // With no schema, no unvalidated caller input reaches the handler.
  if (!schema) return undefined as TInput;

  const result = await schema.safeParseAsync(rawInput);
  if (!result.success) {
    throw new ActionError("INVALID_INPUT", {
      message: "Input failed validation.",
      data: result.error.issues.map(({ path, message, code }) => ({
        path: path.join("."),
        message,
        code,
      })),
    });
  }

  return result.data;
}
