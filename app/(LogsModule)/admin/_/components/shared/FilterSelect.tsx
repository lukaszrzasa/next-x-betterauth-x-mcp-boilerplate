"use client";

import { useId } from "react";
import { Label } from "@/src/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";

/** A labelled native select over a closed vocabulary. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  pending,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  pending: boolean;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="ui:flex ui:flex-col ui:gap-1.5">
      <Label htmlFor={id} className="ui:text-xs ui:text-muted-foreground">
        {label}
      </Label>
      <NativeSelect
        id={id}
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
