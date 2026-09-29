"use client";

import { useId, useState } from "react";
import type { ZodType } from "zod";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

/**
 * A deliberate exact-match filter (an ID, an address, an event key): typed
 * as text - there is no lookup into another module to offer choices - and
 * applied on Enter or when the field loses focus with a changed value. A
 * value the list's codec would drop is refused here with a message instead
 * of silently disappearing from the URL.
 */
export function ExactFilterInput({
  label,
  value,
  placeholder,
  maxLength,
  pending,
  type = "text",
  schema,
  invalidMessage,
  onApply,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  pending: boolean;
  type?: "text" | "email";
  /** What the codec accepts; an empty value always clears the filter. */
  schema: ZodType<string>;
  invalidMessage: string;
  onApply: (value: string) => void;
}) {
  const id = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  const [invalid, setInvalid] = useState(false);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
    setInvalid(false);
  }

  const apply = () => {
    const next = draft.trim();
    if (next === value) return;
    if (next !== "" && !schema.safeParse(next).success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onApply(next);
  };

  return (
    <form
      className="ui:flex ui:flex-col ui:gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <Label htmlFor={id} className="ui:text-xs ui:text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={pending}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className="ui:w-56"
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={apply}
      />
      {invalid && (
        <p id={errorId} className="ui:max-w-56 ui:text-xs ui:text-destructive">
          {invalidMessage}
        </p>
      )}
    </form>
  );
}
