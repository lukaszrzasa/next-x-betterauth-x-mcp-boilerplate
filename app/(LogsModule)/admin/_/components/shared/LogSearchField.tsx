"use client";

import { useId, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { LOG_SEARCH_MAX_LENGTH } from "@/app/(LogsModule)/admin/_/schema";

/**
 * The list's metadata search: each keystroke reports the trimmed text (the
 * caller debounces it), Enter applies it at once. Mirrors the URL when it
 * changes underneath (Back/Forward, a canonical redirect).
 */
export function LogSearchField({
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (q: string) => void;
  onSubmit: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value);
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Label htmlFor={id} className="ui:sr-only">
        {label}
      </Label>
      <div className="ui:relative">
        <SearchIcon
          aria-hidden="true"
          className="ui:pointer-events-none ui:absolute ui:top-1/2 ui:left-3 ui:size-4 ui:-translate-y-1/2 ui:text-muted-foreground"
        />
        <Input
          id={id}
          type="search"
          value={text}
          maxLength={LOG_SEARCH_MAX_LENGTH}
          placeholder={placeholder}
          autoComplete="off"
          className="ui:pl-9"
          onChange={(event) => {
            setText(event.target.value);
            onChange(event.target.value.trim());
          }}
        />
      </div>
    </form>
  );
}
