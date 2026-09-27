"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import type { ActionFailure } from "@/src/lib/actions";
import { describeSettingsFailure, readFieldError } from "@/app/(AuthModule)/_/hooks/settings/feedback";
import type { SettingsFieldError } from "@/app/(AuthModule)/_/types/settings";

/**
 * Attributes a refusal to the form field it names when the form has that
 * field; returns true when it did. Everything else is reported as text for
 * the form's root error by `rootMessage`.
 */
export function attributeFieldError<TValues extends FieldValues>(
  form: Pick<UseFormReturn<TValues, unknown, unknown>, "setError">,
  error: ActionFailure,
  fields: readonly SettingsFieldError["field"][],
): boolean {
  const field = readFieldError(error);
  if (!field || !fields.includes(field.field)) return false;
  form.setError(field.field as Path<TValues>, { type: "server", message: error.message }, { shouldFocus: true });
  return true;
}

export function rootMessage(error: ActionFailure): string {
  const { title, description } = describeSettingsFailure(error);
  return description ? `${title}. ${description}` : title;
}
