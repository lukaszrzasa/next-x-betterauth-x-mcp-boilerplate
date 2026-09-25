"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type DefaultValues, type FieldValues } from "react-hook-form";
import type { z } from "zod";
import { schemaDefaults } from "./schemaDefaults";

/** A react-hook-form instance validated by a Zod schema, with defaults read from the schema. */
export function useSchemaForm<TInput extends FieldValues, TOutput>(
  schema: z.ZodObject & z.ZodType<TOutput, TInput>,
  defaultValues: DefaultValues<TInput> = schemaDefaults<TInput>(schema),
) {
  const form = useForm<TInput, unknown, TOutput>({
    resolver: zodResolver(schema),
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
          message:
            error instanceof Error
              ? error.message
              : "Unable to connect. Please try again.",
        });
      }
    });
  }

  return { form, createSubmitHandler };
}
