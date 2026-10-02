"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import { copyText } from "@/src/lib/browser/clipboard";

type CopyButtonProps = Omit<ComponentProps<typeof Button>, "asChild" | "onClick" | "children"> & {
  /** Exactly what lands on the clipboard. */
  value: string;
  /** What is copied ("Copy user ID"): the accessible name, and the visible text when there are no children. */
  label: string;
  /** Visible text; omit for an icon-only button. */
  children?: ReactNode;
};

/**
 * Copies `value` and confirms it for two seconds. When the clipboard is
 * unavailable (an insecure context, a denied permission) it says so instead
 * of pretending; the value stays selectable on the page.
 */
export function CopyButton({
  value,
  label,
  children,
  type = "button",
  variant = "outline",
  size,
  ...props
}: CopyButtonProps) {
  const t = useTranslations("common.copy");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const status = { idle: label, copied: t("copied"), failed: t("failed") }[state];

  return (
    <Button
      type={type}
      variant={variant}
      size={size ?? (children ? "sm" : "icon-sm")}
      aria-label={status}
      onClick={async () => {
        const copied = await copyText(value);
        setState(copied ? "copied" : "failed");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 2_000);
      }}
      {...props}
    >
      {state === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      {children && <span>{state === "idle" ? children : status}</span>}
      <span role="status" aria-live="polite" className="ui:sr-only">
        {state === "idle" ? "" : status}
      </span>
    </Button>
  );
}
