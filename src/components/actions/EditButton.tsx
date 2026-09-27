import type { ComponentProps } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type EditButtonProps = Omit<ComponentProps<typeof Button>, "asChild">;

/**
 * The standard "edit this value" control: an outlined small button with a
 * pencil and a label saying what it edits ("Edit name", "Change password").
 * Defaults to `type="button"` so it never submits a surrounding form; every
 * `Button` prop can still override the defaults.
 */
export function EditButton({ children, type = "button", variant = "outline", size = "sm", ...props }: EditButtonProps) {
  return (
    <Button type={type} variant={variant} size={size} {...props}>
      <PencilIcon aria-hidden="true" />
      {children}
    </Button>
  );
}
