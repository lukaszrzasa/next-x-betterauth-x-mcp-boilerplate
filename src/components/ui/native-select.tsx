import * as React from "react";
import { cn } from "@/src/lib/utils";
import { ChevronDownIcon } from "lucide-react";

/**
 * The browser's own select, styled to match the inputs. Chosen over a
 * custom listbox for filters and small forms: it works with keyboards and
 * screen readers out of the box and needs no portal.
 */
function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <div
      data-slot="native-select-wrapper"
      className="ui:group/native-select ui:relative ui:w-fit ui:has-[select:disabled]:opacity-50"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "ui:h-9 ui:w-full ui:min-w-0 ui:appearance-none ui:rounded-md ui:border ui:border-input ui:bg-transparent ui:py-1 ui:pr-9 ui:pl-3 ui:text-sm ui:shadow-xs ui:transition-[color,box-shadow] ui:outline-none ui:disabled:cursor-not-allowed ui:data-[size=sm]:h-8 ui:dark:bg-input/30 ui:dark:hover:bg-input/50",
          "ui:focus-visible:border-ring ui:focus-visible:ring-[3px] ui:focus-visible:ring-ring/50",
          "ui:aria-invalid:border-destructive ui:aria-invalid:ring-destructive/20 ui:dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className="ui:pointer-events-none ui:absolute ui:top-1/2 ui:right-3 ui:size-4 ui:-translate-y-1/2 ui:text-muted-foreground"
      />
    </div>
  );
}

function NativeSelectOption({ ...props }: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

export { NativeSelect, NativeSelectOption };
