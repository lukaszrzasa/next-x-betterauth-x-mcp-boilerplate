"use client";

import { useLocale, useTranslations } from "next-intl";
import { useForm, type DefaultValues, type FieldValues } from "react-hook-form";
import type { z } from "zod";
import { localizedZodResolver } from "./localizedResolver";
import { schemaDefaults } from "./schemaDefaults";

/** A react-hook-form instance validated by a Zod schema, with defaults read from the schema. */
export function useSchemaForm<TInput extends FieldValues, TOutput>(
  schema: z.ZodObject & z.ZodType<TOutput, TInput>,
  defaultValues: DefaultValues<TInput> = schemaDefaults<TInput>(schema),
) {
  const locale = useLocale();
  const t = useTranslations();
  const form = useForm<TInput, unknown, TOutput>({
    resolver: localizedZodResolver<TInput, TOutput>(schema, locale, (key, values) =>
      t.has(key as Parameters<typeof t.has>[0]) ? t(key as Parameters<typeof t>[0], values) : null,
    ),
    defaultValues,
  });

  /** Validates, then runs `submit`; a thrown error becomes the form's root error. */
  function createSubmitHandler(submit: (input: TOutput) => Promise<void>) {
    return form.handleSubmit(async (input) => {
      form.clearErrors("root");

      try {
        await submit(input);
      } catch (error) {
        form.setError("root", {
          message: error instanceof Error ? error.message : t("common.form.connectionError"),
        });
      }
    });
  }

  return { form, createSubmitHandler };
}
