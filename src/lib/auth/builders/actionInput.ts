import type { ZodType } from "zod";

import { ActionError } from "@/src/lib/auth/errors";
import type { Locale } from "@/src/lib/i18n/locales";
import { translateIssue } from "@/src/lib/i18n/translate";
import { zodErrorMap } from "@/src/lib/i18n/zod";

/**
 * Validates the caller's input and reports every issue in the request's
 * locale: Zod's own messages through its locale pack, a schema's custom
 * messages (catalog keys) through the catalog.
 */
export async function parseInput<TInput>(
  schema: ZodType<TInput> | undefined,
  rawInput: unknown,
  locale: Locale,
): Promise<TInput> {
  // With no schema, no unvalidated caller input reaches the handler.
  if (!schema) return undefined as TInput;

  const result = await schema.safeParseAsync(rawInput, { error: zodErrorMap(locale) });
  if (!result.success) {
    throw new ActionError("INVALID_INPUT", {
      message: { key: "errors.auth.inputFailedValidation" },
      data: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: translateIssue(locale, issue),
        code: issue.code,
      })),
    });
  }

  return result.data;
}
