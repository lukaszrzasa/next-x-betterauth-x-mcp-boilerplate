"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";

export function FormInput<
  TValues extends FieldValues,
  TTransformedValues = TValues,
>({
  control,
  name,
  label,
  aside,
  ...props
}: Omit<ComponentProps<typeof Input>, "name"> & {
  control: Control<TValues, unknown, TTransformedValues>;
  name: FieldPath<TValues>;
  label: string;
  aside?: ReactNode;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <div className="ui:flex ui:items-center ui:justify-between ui:gap-3">
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {aside}
          </div>
          <Input
            {...field}
            {...props}
            id={name}
            className="ui:h-11"
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.error ? `${name}-error` : undefined}
          />
          {fieldState.error && (
            <FieldError id={`${name}-error`} errors={[fieldState.error]} />
          )}
        </Field>
      )}
    />
  );
}
