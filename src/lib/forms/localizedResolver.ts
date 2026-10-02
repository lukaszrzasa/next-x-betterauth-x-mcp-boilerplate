import { toNestErrors, validateFieldsNatively } from "@hookform/resolvers";
import type { FieldError, FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

import type { Locale } from "@/src/lib/i18n/locales";
import { translateIssueMessage, zodErrorMap, type IssueTranslator } from "@/src/lib/i18n/zod";

/**
 * The Zod resolver in the viewer's language: Zod's own messages through its
 * locale pack, a schema's custom messages (catalog keys) through the
 * catalog, with the issue's bounds (`minimum`, `maximum`) as the key's
 * values. The schema is run here rather than through `zodResolver` because
 * that drops the bounds before a message can use them. Both ends of a form -
 * this resolver and the server's `parseInput` - translate issues identically.
 */
export function localizedZodResolver<TInput extends FieldValues, TOutput>(
  schema: z.ZodType<TOutput, TInput>,
  locale: Locale,
  translate: IssueTranslator,
): Resolver<TInput, unknown, TOutput> {
  return async (values, _context, options) => {
    const result = await schema.safeParseAsync(values, { error: zodErrorMap(locale) });
    if (result.success) {
      if (options.shouldUseNativeValidation) validateFieldsNatively({}, options);
      return { values: result.data, errors: {} };
    }

    const errors: FieldErrors = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path in errors && !options.criteriaMode) continue;
      const error: FieldError = {
        type: issue.code,
        message: translateIssueMessage(translate, issue as Parameters<typeof translateIssueMessage>[1]),
      };
      if (!(path in errors)) errors[path] = error;
    }
    return { values: {}, errors: toNestErrors(errors, options) };
  };
}
