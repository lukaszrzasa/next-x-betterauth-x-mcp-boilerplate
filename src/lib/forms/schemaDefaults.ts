import type { DefaultValues, FieldValues } from "react-hook-form";
import { z } from "zod";

/** Collects each field's `.prefault()` value from the schema. */
export function schemaDefaults<TInput extends FieldValues>(
  schema: z.ZodObject,
): DefaultValues<TInput> {
  return Object.fromEntries(
    Object.entries(schema.shape).flatMap(([key, field]) =>
      field instanceof z.ZodPrefault ? [[key, field.def.defaultValue]] : [],
    ),
  ) as DefaultValues<TInput>;
}
